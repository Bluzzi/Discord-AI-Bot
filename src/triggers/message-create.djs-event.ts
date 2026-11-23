import type { ToolSet } from "ai";
import type { Message } from "discord.js";
import { requestDiscordApproval } from "./interaction-create.djs-event";
import { discordClient, startDiscordTyping } from "#/integrations/discord";
import { aiModel, openRouterApi, openRouterQuota } from "#/integrations/openrouter";
import { tableDiscordReplyError } from "#/tables/discord-reply-error";
import { tableModelUsage } from "#/tables/model-usage";
import { createDiscordApprovalTool } from "#/tools/discord-approval";
import { getDiscordToolsForMessage } from "#/tools/discord-permissions";
import { githubTools } from "#/tools/github";
import { replyContextTools } from "#/tools/reply-context";
import { webTools } from "#/tools/web";
import { aiUsage } from "#/utils/ai-usage";
import { attempt } from "#/utils/attempt";
import { day } from "#/utils/day";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { postgres } from "#/utils/postgres";
import { trigger } from "#/utils/trigger";
import { stepCountIs, streamText } from "ai";
import dedent from "dedent";
import { MessageType } from "discord.js";
import { randomInt, randomUUID } from "node:crypto";
import { inspect } from "node:util";

const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";

const maxSteps = 50;
const replyCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const isReplyTool = (toolName: string) => toolName === "sendReply" || toolName === "sendMessage";

const redactWebhookTokens = (text: string) => text.replace(
  /(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/)[\w-]+/giu,
  "$1[redacted]",
);

const saveReplyError = async (error: unknown, message: Message, label: string) => {
  const id = randomUUID();
  const saved = await attempt(async () => postgres.insert(tableDiscordReplyError).values({
    id,
    messageId: message.id,
    messageContent: message.content,
    errorContent: redactWebhookTokens(inspect(error, { depth: null, customInspect: false })),
  }));

  logger.error(saved.ok ? `${label} (error ID ${id})` : `${label} (could not save error ${id})`);
};

trigger.discordEvent("messageCreate", async (message) => {
  // Check whether the bot needs to reply.
  if (message.author.bot) return;
  const channel = message.channel;
  if (!channel.isSendable()) return;

  const botUser = discordClient.user;
  if (!botUser) return;

  const isReplyToBot = message.type === MessageType.Reply && message.mentions.repliedUser?.id === botUser.id;
  const mentionsBot = message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });
  if (!isReplyToBot && !mentionsBot) return;

  const replyCode = Array.from({ length: 5 }, () => replyCodeAlphabet.charAt(randomInt(replyCodeAlphabet.length))).join("");
  const logPrefix = `[Discord reply ${replyCode}]`;
  const startedAt = Date.now();

  logger.info(`${logPrefix} Reply started for message ${message.id} from @${message.author.username}`);

  if (openRouterQuota.isExhausted()) {
    const reply = await message.reply(NO_QUOTA_REPLY);
    logger.info(`${logPrefix} Context: no AI (OpenRouter quota exhausted)`);
    logger.info(`${logPrefix} Reply: ${JSON.stringify(reply.content)}`);
    logger.info(`${logPrefix} Reply finished in ${String(Date.now() - startedAt)}ms`);
    return;
  }

  // Stream the reply and report tool activity as it happens.
  const channelId = channel.id;
  const guild = message.guild;
  const member = message.member;
  const { tools, approvalToolNames } = getDiscordToolsForMessage(message);
  const approvalTools: ToolSet = {};
  if (member !== null && approvalToolNames.length > 0) {
    approvalTools.proposeDiscordActions = createDiscordApprovalTool(approvalToolNames, async (actions, summary) => requestDiscordApproval(channel, member, actions, summary));
  }
  const result = streamText({
    model: aiModel,
    stopWhen: [stepCountIs(maxSteps), ({ steps }) => steps.at(-1)?.toolResults.some(({ toolName }) => isReplyTool(toolName)) ?? false],
    instructions: dedent`
      Tu es ${env.DISCORD_BOT_NAME} (ce nom ne défini pas ton comportement), l’assistant Discord de la communauté « Le Royaume ».

      Donne la réponse dès la première phrase. Ajoute seulement les détails utiles. Écris en texte simple, avec des paragraphes courts séparés par une ligne vide. Utilise une liste à puces pour une énumération si elle facilite la lecture. Par défaut, évite les titres, le gras et les séparateurs comme \`---\`.

      Mets les noms de fichiers, chemins, commandes, identifiants de code et autre si pertinent entre backticks, par exemple \`GuildAdminPolicy\`, \`missingPermissions\` et \`access-policy.ts\`.

      Utilise des liens Markdown avec un libellé court et précis, par exemple [Communiqué de Nvidia](https://example.com/communique). Intègre chaque lien au passage qu’il documente, sur les mots concernés ou à la fin du paragraphe (ou de la puce) qu’il appuie. N’affiche pas d’URL brute et ne regroupe pas les sources en bas du message, sauf si l’utilisateur le demande.

      Évite les salutations, les emojis décoratifs, les tirets (—, -) et les offres d’aide génériques.

      Si on te demande des informations sauvegardés en mémoire concernant les utilisateurs, explique que c'est désormais <@1573860551610863766> et <@1574150367325855856> qui gèrent ceci.

      Si proposeDiscordActions est disponible et que la demande nécessite des modifications, regroupe les actions prévues dans un seul plan. Un résultat waiting_approval indique que les actions sont en attente d’un clic du demandeur sur le bouton « Approuver ». Continue les tâches indépendantes et précise dans ta réponse quelles actions restent à approuver.

      Réponds via \`sendReply\`. En cas d'échec, utilise \`sendMessage\` dans le même salon.
    `,
    prompt: dedent`
      Contexte d'exécution :
      - Ton ID Discord : ${env.DISCORD_BOT_ID}
      - Channel ID : ${channelId}
      - Message cible : ID ${message.id} (auteur ID ${message.author.id})
      ${guild ? `- Guild ID : ${guild.id}` : "- Message privé (pas de guild)"}
      - Date et heure actuelles : ${day().tz().format("DD/MM/YYYY [à] HH[h]mm")}

      Commence par \`getReplyContext\` pour lire le channel, la conversation récente (le message cible y est marqué "isTarget"), le message auquel il répond et les mentions.
    `,
    prepareStep: ({ stepNumber, steps }) => {
      if (stepNumber === 0) return { toolChoice: { type: "tool", toolName: "getReplyContext" } };
      if (stepNumber === maxSteps - 1) {
        const triedReply = steps.some((step) => step.toolCalls.some(({ toolName }) => toolName === "sendReply"));
        return { toolChoice: { type: "tool", toolName: triedReply ? "sendMessage" : "sendReply" } };
      }
      return { toolChoice: "required" };
    },
    tools: {
      ...tools,
      ...approvalTools,
      ...replyContextTools,
      ...githubTools,
      ...webTools,
    },
    toolsContext: {
      getReplyContext: { channelId, messageId: message.id },
    },
    onToolExecutionStart: ({ toolCall }) => {
      if (toolCall.toolName === "proposeDiscordActions" || isReplyTool(toolCall.toolName)) {
        logger.info(`${logPrefix} Tool ${toolCall.toolName}`);
        return;
      }
      logger.info(`${logPrefix} Tool ${toolCall.toolName} ${redactWebhookTokens(JSON.stringify(toolCall.input))}`);
    },
    onStepEnd: ({ stepNumber, text }) => {
      if (text) logger.info(`${logPrefix} Step ${String(stepNumber + 1)} text: ${redactWebhookTokens(text)}`);
    },
    // Stream errors are propagated to the Discord event handler below.
    onError: () => undefined,
  });

  const stopTyping = startDiscordTyping(channel, () => logger.warn(`${logPrefix} Could not send the typing indicator`));

  const sentReplies: string[] = [];
  try {
    for await (const part of result.stream) {
      if (part.type === "error") throw new Error(`${logPrefix} Reply stream failed`, { cause: part.error });
      if (part.type === "tool-error") {
        await saveReplyError(part.error, message, `${logPrefix} Tool ${part.toolName} failed`);
      }
      if (part.type === "tool-result" && isReplyTool(part.toolName)) {
        stopTyping();
        const input: unknown = part.input;
        if (typeof input === "object" && input !== null && "content" in input && typeof input.content === "string") {
          sentReplies.push(input.content);
        }
      }
    }
  }
  finally {
    stopTyping();
  }

  // Log and save the metrics for all steps.
  const durationMs = Date.now() - startedAt;
  const [steps, usage] = await Promise.all([result.steps, result.usage]);
  const replied = steps.some((step) => step.toolResults.some(({ toolName }) => isReplyTool(toolName)));

  if (!replied) {
    logger.warn(`${logPrefix} No reply was sent in ${String(steps.length)} steps`);
  }

  logger.info(`${logPrefix} Context: ${aiUsage.formatTokens(usage)}`);
  logger.info(`${logPrefix} Reply: ${sentReplies.length ? JSON.stringify(redactWebhookTokens(sentReplies.join("\n"))) : "(none)"}`);
  logger.info(`${logPrefix} Reply finished in ${String(durationMs)}ms`);

  const modelUsed = steps.at(-1)?.model.modelId;
  if (modelUsed === undefined) {
    throw new Error(`${logPrefix} Cannot resolve the used model: no step available`);
  }

  const prices = await openRouterApi.computeUsagePrices(modelUsed, usage);

  await postgres.insert(tableModelUsage).values({
    cause: "reply_to_message",
    inputTokenCount: usage.inputTokens ?? 0,
    outputTokenCount: usage.outputTokens ?? 0,
    inputPrice: prices.inputPrice,
    outputPrice: prices.outputPrice,
    modelUsed,
  });
}, async (error, message) => saveReplyError(error, message, "Discord reply failed"));

import type { ToolSet } from "ai";
import { requestDiscordApproval } from "./interaction-create.djs-event";
import { discordClient, startDiscordTyping } from "#/integrations/discord";
import { aiModel, openRouterApi, openRouterQuota } from "#/integrations/openrouter";
import { tableModelUsage } from "#/tables/model-usage";
import { createDiscordApprovalTool } from "#/tools/discord-approval";
import { getDiscordToolsForMessage } from "#/tools/discord-permissions";
import { githubTools } from "#/tools/github";
import { replyContextTools } from "#/tools/reply-context";
import { webTools } from "#/tools/web";
import { aiUsage } from "#/utils/ai-usage";
import { day } from "#/utils/day";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { postgres } from "#/utils/postgres";
import { trigger } from "#/utils/trigger";
import { stepCountIs, streamText } from "ai";
import dedent from "dedent";
import { MessageType } from "discord.js";
import { randomUUID } from "node:crypto";

const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";

const maxSteps = 50;
const isReplyTool = (toolName: string) => toolName === "sendReply" || toolName === "sendMessage";

const redactWebhookTokens = (text: string) => text.replace(
  /(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/)[\w-]+/giu,
  "$1[redacted]",
);

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

  const logPrefix = `[Discord reply ${randomUUID()}]`;

  if (openRouterQuota.isExhausted()) {
    logger.info(`${logPrefix} Reply to ${message.author.displayName} without AI (OpenRouter quota exhausted)`);
    await message.reply(NO_QUOTA_REPLY);
    return;
  }

  // Stream the reply and report tool activity as it happens.
  const channelId = channel.id;
  const guild = message.guild;
  const member = message.member;
  const { tools, approvalToolNames } = getDiscordToolsForMessage(message);
  const approvalTools: ToolSet = {};
  if (member !== null && approvalToolNames.length > 0) {
    approvalTools.proposeDiscordActions = createDiscordApprovalTool(approvalToolNames, async (actions) => requestDiscordApproval(channel, member, actions));
  }
  const startedAt = Date.now();

  logger.info(`${logPrefix} Reply started for message ${message.id} from ${message.author.username}`);

  const result = streamText({
    model: aiModel,
    stopWhen: [stepCountIs(maxSteps), ({ steps }) => steps.at(-1)?.toolResults.some(({ toolName }) => isReplyTool(toolName)) ?? false],
    instructions: dedent`
      Tu es ${env.DISCORD_BOT_NAME} (ce nom ne défini pas ton comportement), l’assistant Discord de la communauté « Le Royaume ».

      Donne la réponse dès la première phrase. Ajoute seulement les détails utiles. Privilégie des paragraphes courts et utilise des titres ou des listes s’ils facilitent la lecture.

      Mets les noms de fichiers, chemins, commandes, identifiants de code et autre si pertinent entre backticks, par exemple \`GuildAdminPolicy\`, \`missingPermissions\` et \`access-policy.ts\`.

      Utilise des liens Markdown avec un libellé court et précis, par exemple [Communiqué de Nvidia](https://example.com/communique). Intègre chaque lien au passage qu’il documente, sur les mots concernés ou à la fin du paragraphe (ou de la puce) qu’il appuie. N’affiche pas d’URL brute et ne regroupe pas les sources en bas du message, sauf si l’utilisateur le demande.

      Évite les salutations, les emojis décoratifs, les tirets (—, -) et les offres d’aide génériques.

      Si on te demande des informations sauvegardés en mémoire concernant les utilisateurs, explique que c'est désormais <@1573860551610863766> et <@1574150367325855856> qui gèrent ceci.

      Si proposeDiscordActions est disponible et que la demande nécessite des modifications, regroupe les actions prévues dans un seul plan. Un résultat waiting_approval indique que les actions sont en attente d’un clic du demandeur sur le bouton « Appliquer ». Continue les tâches indépendantes et précise dans ta réponse quelles actions restent à approuver.

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
      if (toolCall.toolName === "proposeDiscordActions") {
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

  try {
    for await (const part of result.stream) {
      if (part.type === "error") throw new Error(`${logPrefix} Reply stream failed`, { cause: part.error });
      if (part.type === "tool-error") {
        const details = part.error instanceof Error ? part.error.stack ?? part.error.message : String(part.error);
        logger.error(`${logPrefix} Tool ${part.toolName} failed`, redactWebhookTokens(details));
      }
      if (part.type === "tool-result" && isReplyTool(part.toolName)) stopTyping();
    }
  }
  finally {
    stopTyping();
  }

  // Log and save the metrics for all steps.
  const durationMs = Date.now() - startedAt;
  const [steps, finishReason, usage, text] = await Promise.all([result.steps, result.finishReason, result.usage, result.text]);
  const replied = steps.some((step) => step.toolResults.some(({ toolName }) => isReplyTool(toolName)));

  logger.info(dedent`
    ${logPrefix} Reply finished:
    - [REPLIED] ${replied ? "yes" : "no"}
    - [TEXT] ${redactWebhookTokens(text)}
    - [CONTEXT] ${aiUsage.formatTokens(usage)}
    - [PERF] ${steps.length} steps, finish: ${finishReason}, ${durationMs} ms
  `);

  if (!replied) {
    logger.warn(`${logPrefix} No reply was sent in ${String(steps.length)} steps`);
  }

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
});

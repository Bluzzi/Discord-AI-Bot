import type { DiscordApprovalAction } from "#/tools/discord-approval";
import type { Message } from "discord.js";
import { requestDiscordApproval } from "./interaction-create.djs-event";
import { aiModel } from "#/integrations/ai-sdk.client";
import { aiUsage } from "#/integrations/ai-sdk.helper-usage";
import { getDiscordChannelPermissions } from "#/integrations/discord.helper";
import { getDiscordToolsForMessage } from "#/integrations/discord.helper-permissions";
import { channelTypingManager } from "#/integrations/discord.helper-typing";
import { openRouterApi } from "#/integrations/openrouter.helper-pricing";
import { openRouterQuota } from "#/integrations/openrouter.helper-quota";
import { postgres } from "#/integrations/postgres.client";
import { reportError } from "#/tables/error-reporting.helper";
import { tableModelUsage } from "#/tables/model-usage.table";
import { discordMetricTools } from "#/tools/discord-metric";
import { fileTools } from "#/tools/file";
import { githubTools } from "#/tools/github";
import { railwayTools } from "#/tools/railway";
import { webTools } from "#/tools/web";
import { day } from "#/utils/day";
import { discordReplyContext } from "#/utils/discord-reply-context";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { randomCode } from "#/utils/random";
import { trigger } from "#/utils/trigger";
import { stepCountIs, streamText, type ToolResultPart } from "ai";
import dedent from "dedent";
import { MessageType, PermissionFlagsBits } from "discord.js";
import { randomUUID } from "node:crypto";

const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";
const MAX_STEP = 50;

const isReplyTool = (toolName: string) => toolName === "sendReply" || toolName === "sendMessage";

const handleDiscordReply = async (message: Message<true>) => {
  // Ignore bot messages and channels that cannot receive replies:
  if (message.author.bot) return;
  if (!message.channel.isSendable()) return;
  if (!message.channel.isTextBased()) return;
  if (!message.member) return;

  // Accept a direct reply to the bot or an explicit mention:
  const isReplyToBot = message.type === MessageType.Reply && message.mentions.repliedUser?.id === env.DISCORD_BOT_ID;
  const mentionsBot = message.mentions.has(env.DISCORD_BOT_ID, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });
  if (!isReplyToBot && !mentionsBot) return;

  // Keep typing while handling this message:
  channelTypingManager.add(message.channelId);

  // Identify the reply in logs and handle exhausted quota:
  const logPrefix = `[Discord reply ${randomCode()}]`;
  const startedAt = Date.now();

  logger.info(`${logPrefix} Reply started for message ${message.id} from @${message.author.username}`);

  if (openRouterQuota.isExhausted()) {
    const reply = await message.reply(NO_QUOTA_REPLY);
    logger.info(`${logPrefix} Context: no AI (OpenRouter quota exhausted)`);
    logger.info(`${logPrefix} Reply: ${JSON.stringify(reply.content)}`);
    logger.info(`${logPrefix} Reply finished in ${String(Date.now() - startedAt)}ms`);
    channelTypingManager.sub(message.channelId);
    return;
  }

  // Fetch the target message and its history without including later messages:
  const previousMessages = await message.channel.messages.fetch({ limit: 10, before: message.id });
  const canReadHistory = getDiscordChannelPermissions(message.member, message.channel)
    .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]);

  const messages = [message];
  if (canReadHistory) messages.push(...previousMessages.values());
  messages.toSorted((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Prepare the channel and target references for the AI context:
  const faleToolCallID = randomUUID();
  const contextOutput: ToolResultPart["output"] = {
    type: "json",
    value: {
      channel: {
        id: message.channel.id,
        name: message.channel.name,
        guildId: message.channel.guild.id,
        guildName: message.guild.name,
      },
      referencedMessageId: message.id,
      referencedAuthorId: message.author.id,
      mentionedUserIds: [...message.mentions.users.values()].filter((user) => user.id !== env.DISCORD_BOT_ID).map((user) => user.id),
      mentionedChannelIds: [...message.mentions.channels.values()].map((mentionedChannel) => mentionedChannel.id),
      conversation: messages.map((element) => ({
        id: element.id,
        authorId: element.author.id,
        authorLabel: element.member?.displayName ?? element.author.globalName ?? element.author.username,
        content: element.content,
        isSelf: element.author.id === env.DISCORD_BOT_ID,
        isTarget: element.id === message.id,
        createdAt: element.createdAt.toISOString(),
        attachments: element.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          mediaType: attachment.contentType,
          size: attachment.size,
        })),
      })),
    },
  };

  // Select the tools available for this conversation:
  const requestApproval = async (actions: DiscordApprovalAction[], summary: string) => {
    return requestDiscordApproval(message.channel, message.member!, actions, summary);
  };
  const discordTools = getDiscordToolsForMessage(message, requestApproval);

  // Start generation and log tool activity:
  const result = streamText({
    model: aiModel,
    stopWhen: [stepCountIs(MAX_STEP), ({ steps }) => steps.at(-1)?.toolResults.some(({ toolName }) => isReplyTool(toolName)) ?? false],
    instructions: dedent`
      Tu es ${env.DISCORD_BOT_NAME} (ce nom ne défini pas ton comportement), l'assistant Discord de la communauté « Le Royaume ».

      Donne la réponse dès la première phrase. Ajoute seulement les détails utiles. Écris en texte simple, avec des paragraphes courts séparés par une ligne vide. Utilise une liste à puces pour une énumération si elle facilite la lecture. Par défaut, évite les titres, le gras et les séparateurs comme \`---\`.

      Mets les noms de fichiers, chemins, commandes, identifiants de code et autre si pertinent entre backticks.

      Utilise des liens Markdown avec un libellé court et précis. Intègre chaque lien au passage qu'il documente, sur les mots concernés ou à la fin du paragraphe (ou de la puce) qu'il appuie. N'affiche pas d'URL brute et ne regroupe pas les sources en bas du message, sauf si l'utilisateur le demande.

      Évite les salutations, les emojis décoratifs, les tirets (—, -) et les offres d'aide génériques.

      Si on te demande des informations sauvegardés en mémoire concernant les utilisateurs, explique que c'est désormais <@1573860551610863766> et <@1574150367325855856> qui gèrent ceci.

      Si proposeDiscordActions est disponible et que la demande nécessite des créations, des modifications ou des suppressions, regroupe les actions prévues dans un seul plan. Un résultat waiting_approval indique que les actions sont en attente d'un clic du demandeur sur le bouton « Approuver ». Continue les autres tâches.

      Réponds via \`sendReply\`. En cas d'échec, utilise \`sendMessage\` dans le même salon.

      Contexte d'exécution :
      - Ton ID Discord : ${env.DISCORD_BOT_ID}
      - Date et heure actuelles : ${day().tz().format("DD/MM/YYYY [à] HH[h]mm")}

      Le message cible est marqué isTarget.
      Chaque message liste les métadonnées de ses pièces jointes. Utilise \`readFile\` avec l'ID de la pièce jointe si tu as besoin de lire son contenu. Si le message demande de traiter une image sans la préciser, privilégie les images du message cible, puis celles du message auquel il répond.
    `,
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: faleToolCallID, toolName: "getReplyContext", input: {} }],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: faleToolCallID, toolName: "getReplyContext", output: contextOutput }],
      },
    ],
    prepareStep: ({ stepNumber, steps }) => {
      // Reserve the final step for sending a reply or its fallback:
      if (stepNumber !== MAX_STEP - 1) return { toolChoice: "required" };
      const triedReply = steps.some((step) => step.toolCalls.some(({ toolName }) => toolName === "sendReply"));
      return { toolChoice: { type: "tool", toolName: triedReply ? "sendMessage" : "sendReply" } };
    },
    tools: {
      ...discordTools,
      ...discordMetricTools,
      ...fileTools,
      ...(env.RAILWAY_TOKEN === undefined ? {} : railwayTools),
      ...githubTools,
      ...webTools,
    },
    onToolExecutionStart: ({ toolCall }) => {
      // Omit reply, approval and sandbox file contents from tool logs:
      if (toolCall.toolName === "proposeDiscordActions" || isReplyTool(toolCall.toolName)) {
        logger.info(`${logPrefix} Tool ${toolCall.toolName}`);
        return;
      }

      const input: unknown = toolCall.input;
      const loggedInput = toolCall.toolName === "writeRailwayFile" || toolCall.toolName === "uploadRailwayAttachment" ? ({
        path: input !== null && typeof input === "object" && "path" in input ? input.path : undefined,
      }) : (
        input
      );
      logger.info(`${logPrefix} Tool ${toolCall.toolName} ${JSON.stringify(loggedInput)}`);
    },
    onStepEnd: ({ stepNumber, text }) => {
      if (text) logger.info(`${logPrefix} Step ${String(stepNumber + 1)} text: ${text}`);
    },
    // Let the Discord handler record stream errors:
    onError: () => undefined,
  });

  // Consume stream results and collect the replies:
  const sentReplies: string[] = [];

  for await (const part of result.stream) {
    if (part.type === "error") {
      throw new Error("Reply stream failed", { cause: part.error });
    }

    if (part.type === "tool-error") {
      await reportError(part.error, `${logPrefix} Tool ${part.toolName} failed`);
      continue;
    }

    if (part.type !== "tool-result" || !isReplyTool(part.toolName)) {
      continue;
    }

    const input: unknown = part.input;
    if (typeof input === "object" && input !== null && "content" in input && typeof input.content === "string") {
      sentReplies.push(input.content);
    }
  }

  // Log the reply and save usage for all steps:
  const durationMs = Date.now() - startedAt;
  const [steps, usage] = await Promise.all([result.steps, result.usage]);

  const replied = steps.some((step) => step.toolResults.some(({ toolName }) => isReplyTool(toolName)));
  if (!replied) {
    logger.warn(`${logPrefix} No reply was sent in ${String(steps.length)} steps`);
  }

  logger.info(`${logPrefix} Context: ${aiUsage.formatTokens(usage)}`);
  logger.info(`${logPrefix} Reply: ${sentReplies.length ? JSON.stringify(sentReplies.join("\n")) : "(none)"}`);
  logger.info(`${logPrefix} Reply finished in ${String(durationMs)}ms`);

  // Price the observed model usage and persist it:
  const modelUsed = steps.at(-1)?.model.modelId;
  if (modelUsed === undefined) {
    throw new Error("Cannot resolve the used model: no step available");
  }

  const prices = await openRouterApi.computeUsagePrices(modelUsed, usage);

  await postgres.insert(tableModelUsage).values({
    cause: "reply_to_message",
    stepCount: steps.length,
    inputTokenCount: usage.inputTokens ?? 0,
    outputTokenCount: usage.outputTokens ?? 0,
    inputPrice: prices.inputPrice,
    outputPrice: prices.outputPrice,
    modelUsed,
  });

  // Release this message's typing indicator:
  channelTypingManager.sub(message.channel.id);
};

trigger.discordEvent({
  eventName: "messageCreate",
  handler: async (message) => {
    if (!message.inGuild()) return;
    return discordReplyContext.run({ guildId: message.guildId }, async () => handleDiscordReply(message));
  },
  onError: async (error, message) => {
    channelTypingManager.sub(message.channelId);
    await reportError(error, "Discord reply failed");
  },
});

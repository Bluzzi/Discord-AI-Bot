import type { DiscordApprovalAction } from "#/tools/discord-approval";
import type { Message } from "discord.js";
import { requestDiscordApproval } from "./interaction-create.djs-event";
import { aiModel } from "#/integrations/ai-sdk.client";
import { aiUsage } from "#/integrations/ai-sdk.helper-usage";
import { discordClient } from "#/integrations/discord.client";
import { getDiscordChannelPermissions } from "#/integrations/discord.helper";
import { getDiscordToolsForMessage } from "#/integrations/discord.helper-permissions";
import { openRouterApi } from "#/integrations/openrouter.helper-pricing";
import { openRouterQuota } from "#/integrations/openrouter.helper-quota";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordReplyError } from "#/tables/discord-reply-error";
import { tableModelUsage } from "#/tables/model-usage";
import { fileTools } from "#/tools/file";
import { githubTools } from "#/tools/github";
import { railwayTools } from "#/tools/railway";
import { webTools } from "#/tools/web";
import { day } from "#/utils/day";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { stepCountIs, streamText } from "ai";
import dedent from "dedent";
import { MessageType, PermissionFlagsBits } from "discord.js";
import { randomInt, randomUUID } from "node:crypto";
import { inspect } from "node:util";

const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";

const maxSteps = 50;
const replyCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;

const isReplyTool = (toolName: string) => toolName === "sendReply" || toolName === "sendMessage";

const redactWebhookTokens = (text: string) => text.replace(
  /(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/)[\w-]+/giu,
  "$1[redacted]",
);

const saveReplyError = async (error: unknown, message: Message, label: string) => {
  // Save the error with webhook tokens redacted:
  const id = randomUUID();
  try {
    await postgres.insert(tableDiscordReplyError).values({
      id,
      messageId: message.id,
      messageContent: message.content,
      errorContent: redactWebhookTokens(inspect(error, { depth: null, customInspect: false })),
    });
  }
  catch {
    logger.error(`${label} (could not save error ${id})`);
    return;
  }

  logger.error(`${label} (error ID ${id})`);
};

trigger.discordEvent("messageCreate", async (message) => {
  // Ignore bot messages and channels that cannot receive replies:
  if (message.author.bot) return;
  const { channel } = message;
  if (!channel.isSendable()) return;

  // Accept a direct reply to the bot or an explicit mention:
  const botUser = discordClient.user;
  if (botUser === null) return;
  const isReplyToBot = message.type === MessageType.Reply && message.mentions.repliedUser?.id === botUser.id;
  const mentionsBot = message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });
  if (!isReplyToBot && !mentionsBot) return;

  // Identify the reply in logs and handle exhausted quota:
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

  // Keep typing while preparing the conversation and generating the reply:
  const sendTyping = async () => {
    try {
      await channel.sendTyping();
    }
    catch {
      logger.warn(`${logPrefix} Could not send the typing indicator`);
    }
  };
  void sendTyping();
  const typingTimer = setInterval(() => {
    void sendTyping();
  }, 8_000).unref();

  try {
    // Verify that the current channel supports message history:
    const { channelId, id: messageId, guild, member } = message;
    const historyChannel = await discordClient.channels.fetch(channelId);
    if (historyChannel?.isTextBased() !== true) {
      throw new Error("Channel not found or not a text channel");
    }

    // Fetch the target and its history without including later messages:
    const previousMessages = await historyChannel.messages.fetch({ limit: 10, before: messageId });
    const targetMessage = await historyChannel.messages.fetch(messageId);

    const referencedMessageId = targetMessage.reference?.messageId ?? null;

    // Prepare the channel and target references for the model:
    const historyGuild = "guild" in historyChannel ? historyChannel.guild : null;
    const replyContext = {
      channel: {
        id: historyChannel.id,
        name: "name" in historyChannel ? historyChannel.name : null,
        isDm: historyGuild === null,
        guildId: historyGuild?.id ?? null,
        guildName: historyGuild?.name ?? null,
      },
      referencedMessageId,
      referencedAuthorId: referencedMessageId === null ? null : previousMessages.get(referencedMessageId)?.author.id ?? null,
      mentionedUserIds: [...targetMessage.mentions.users.values()].filter((user) => user.id !== env.DISCORD_BOT_ID).map((user) => user.id),
      mentionedChannelIds: [...targetMessage.mentions.channels.values()].map((mentionedChannel) => mentionedChannel.id),
    };

    // List attachment metadata from the target and readable channel history:
    const canReadHistory = !("guild" in historyChannel) || (member !== null
      && getDiscordChannelPermissions(member, historyChannel).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]));
    const conversation = [...previousMessages.values(), targetMessage]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map((message) => ({
        id: message.id,
        authorId: message.author.id,
        authorLabel: message.member?.displayName ?? message.author.globalName ?? message.author.username,
        content: message.content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),
        isSelf: message.author.id === env.DISCORD_BOT_ID,
        isTarget: message.id === messageId,
        createdAt: message.createdAt.toISOString(),
        attachments: canReadHistory || message.id === messageId ? message.attachments.map(({ id, name, url, contentType, size }) => ({ id, name, url, mediaType: contentType, size })) : [],
      }));

    // Represent the preloaded context as a completed tool call:
    const toolCallId = randomUUID();
    const contextOutput = { type: "json" as const, value: { ...replyContext, conversation } };

    // Select the tools available for this conversation:
    const requestApproval = member === null ? undefined : async (actions: DiscordApprovalAction[], summary: string) => requestDiscordApproval(channel, member, actions, summary);
    const discordTools = getDiscordToolsForMessage(message, requestApproval);

    // Start generation and log tool activity:
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

        Si proposeDiscordActions est disponible et que la demande nécessite des créations, des modifications ou des suppressions, regroupe les actions prévues dans un seul plan. Un résultat waiting_approval indique que les actions sont en attente d’un clic du demandeur sur le bouton « Approuver ». Continue les autres tâches.

        Réponds via \`sendReply\`. En cas d'échec, utilise \`sendMessage\` dans le même salon.

        Contexte d'exécution :
        - Ton ID Discord : ${env.DISCORD_BOT_ID}
        - Channel ID : ${channelId}
        - Message cible : ID ${message.id} (auteur ID ${message.author.id})
        ${guild ? `- Guild ID : ${guild.id}` : "- Message privé (pas de guild)"}
        - Date et heure actuelles : ${day().tz().format("DD/MM/YYYY [à] HH[h]mm")}

        La conversation récente suit par ordre chronologique. Le message cible est marqué isTarget.
        Chaque message liste les métadonnées de ses pièces jointes. Utilise \`readFile\` avec l’ID de la pièce jointe si tu as besoin de lire son contenu. Si le message demande de traiter une image sans la préciser, privilégie les images du message cible, puis celles du message auquel il répond.
      `,
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId, toolName: "getReplyContext", input: {} }],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId, toolName: "getReplyContext", output: contextOutput }],
        },
      ],
      prepareStep: ({ stepNumber, steps }) => {
        // Reserve the final step for sending a reply or its fallback:
        if (stepNumber !== maxSteps - 1) return { toolChoice: "required" };
        const triedReply = steps.some((step) => step.toolCalls.some(({ toolName }) => toolName === "sendReply"));
        return { toolChoice: { type: "tool", toolName: triedReply ? "sendMessage" : "sendReply" } };
      },
      tools: {
        ...discordTools,
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
        const loggedInput = toolCall.toolName === "writeRailwayFile" || toolCall.toolName === "uploadRailwayAttachment" ? { path: input !== null && typeof input === "object" && "path" in input ? input.path : undefined } : input;
        logger.info(`${logPrefix} Tool ${toolCall.toolName} ${redactWebhookTokens(JSON.stringify(loggedInput))}`);
      },
      onStepEnd: ({ stepNumber, text }) => {
        if (text) logger.info(`${logPrefix} Step ${String(stepNumber + 1)} text: ${redactWebhookTokens(text)}`);
      },
      // Let the Discord handler record stream errors:
      onError: () => undefined,
    });

    // Consume stream results and stop typing when a reply is sent:
    const sentReplies: string[] = [];
    for await (const part of result.stream) {
      if (part.type === "error") throw new Error(`${logPrefix} Reply stream failed`, { cause: part.error });
      if (part.type === "tool-error") {
        await saveReplyError(part.error, message, `${logPrefix} Tool ${part.toolName} failed`);
        continue;
      }
      if (part.type !== "tool-result" || !isReplyTool(part.toolName)) continue;
      clearInterval(typingTimer);
      const input: unknown = part.input;
      if (typeof input === "object" && input !== null && "content" in input && typeof input.content === "string") {
        sentReplies.push(input.content);
      }
    }
    clearInterval(typingTimer);

    // Log the reply and save usage for all steps:
    const durationMs = Date.now() - startedAt;
    const [steps, usage] = await Promise.all([result.steps, result.usage]);
    const replied = steps.some((step) => step.toolResults.some(({ toolName }) => isReplyTool(toolName)));

    if (!replied) {
      logger.warn(`${logPrefix} No reply was sent in ${String(steps.length)} steps`);
    }

    logger.info(`${logPrefix} Context: ${aiUsage.formatTokens(usage)}`);
    logger.info(`${logPrefix} Reply: ${sentReplies.length ? JSON.stringify(redactWebhookTokens(sentReplies.join("\n"))) : "(none)"}`);
    logger.info(`${logPrefix} Reply finished in ${String(durationMs)}ms`);

    // Price the observed model usage and persist it:
    const modelUsed = steps.at(-1)?.model.modelId;
    if (modelUsed === undefined) {
      throw new Error(`${logPrefix} Cannot resolve the used model: no step available`);
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
  }
  finally {
    // Stop the typing indicator on every exit, including stream failures:
    clearInterval(typingTimer);
  }
}, async (error, message) => saveReplyError(error, message, "Discord reply failed"));

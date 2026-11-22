import { discordClient } from "#/integrations/discord";
import { aiModel, openRouterApi, openRouterQuota } from "#/integrations/openrouter";
import { tableModelUsage } from "#/tables/model-usage";
import { discordTools } from "#/tools/discord";
import { replyContextTools } from "#/tools/reply-context";
import { websearchTools } from "#/tools/websearch";
import { aiUsage } from "#/utils/ai-usage";
import { day } from "#/utils/day";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { postgres } from "#/utils/postgres";
import { trigger } from "#/utils/trigger";
import { generateText, hasToolCall, stepCountIs } from "ai";
import dedent from "dedent";

const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";

const replyToolNames = ["sendReply", "sendMessage", "sendDm", "sendEmbed", "sendFile", "sendWebhookMessage", "createPoll", "addReaction"] as const;

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.id === "1444427058481467462") return;
  if (message.author.bot) return;
  if (!message.channel.isTextBased()) return;

  const botUser = discordClient.user;

  if (!botUser || !message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true })) return;

  if (openRouterQuota.isExhausted()) {
    logger.info(`Reply to ${message.author.displayName} without AI (OpenRouter quota exhausted, explicit mention)`);
    await message.reply(NO_QUOTA_REPLY);
    return;
  }

  const channelId = message.channel.id;
  const guild = message.guild;
  const startedAt = Date.now();

  const result = await generateText({
    model: aiModel,
    stopWhen: [stepCountIs(20), hasToolCall(...replyToolNames)],
    instructions: dedent`
      Tu es ${env.DISCORD_BOT_NAME}, un assistant Discord sympa dans « Le Royaume », une communauté de gamers, de développeurs, de designers et de personnes de tous horizons.
      Aide les membres avec des réponses claires, brèves et adaptées à leur demande.
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
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) return { toolChoice: { type: "tool", toolName: "getReplyContext" } };
    },
    tools: {
      ...discordTools,
      ...replyContextTools,
      ...websearchTools,
    },
    toolsContext: {
      getReplyContext: { channelId, messageId: message.id },
    },
  });

  const durationMs = Date.now() - startedAt;
  const replied = result.steps.some((step) => step.toolCalls.some((toolCall) => (replyToolNames as readonly string[]).includes(toolCall.toolName)));

  logger.info(dedent`
    Reply to message:
    - [AUTHOR] ${message.author.username}: ${message.content}
    - [REPLIED] ${replied ? "yes" : "no"}
    - [TEXT] ${result.text}
    - [CONTEXT] ${aiUsage.formatTokens(result.usage)}
    - [TOOLS] ${aiUsage.formatToolCalls(result.toolCalls)} | errors: ${aiUsage.formatToolErrors(result.content)}
    - [PERF] ${result.steps.length} steps, finish: ${result.finishReason}, ${durationMs} ms
  `);

  if (!replied) {
    logger.warn(`Explicit mention from ${message.author.username} produced no send tool call (${String(result.steps.length)} steps)`);
  }

  const modelUsed = result.steps.at(-1)?.model.modelId;
  if (modelUsed === undefined) {
    throw new Error("Cannot resolve the used model: no step available");
  }

  const prices = await openRouterApi.computeUsagePrices(modelUsed, result.usage);

  await postgres.insert(tableModelUsage).values({
    cause: "reply_to_message",
    inputTokenCount: result.usage.inputTokens ?? 0,
    outputTokenCount: result.usage.outputTokens ?? 0,
    inputPrice: prices.inputPrice,
    outputPrice: prices.outputPrice,
    modelUsed,
  });
});

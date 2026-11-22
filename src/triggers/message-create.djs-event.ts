import { modelUsageRepository } from "#/database/model-usage-repository";
import { generateReply } from "#/features/reply";
import { discordClient } from "#/integrations/discord";
import { openRouterQuota } from "#/integrations/openrouter";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

// Reply used without any AI call while the OpenRouter quota is exhausted (funny, in Jean Pascal's tone):
const NO_QUOTA_REPLY = "J'ai trop bossé aujourd'hui, je cherche un financement pour tourner 24/7. Réveillez-moi quand le budget passe.";

// The configured bot name acts like a mention when matched as whole words, case-insensitively:
const botName = env.DISCORD_BOT_NAME.trim();

const botNamePattern = botName.length > 0 ? new RegExp(`(?<![\\p{L}\\p{N}_])${botName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu") : null;

// Code blocks are stripped before matching, so quoted or shared code never triggers the bot:
const codeBlockPattern = /```[\s\S]*?```|`[^`\n]*`/gu;

const isBotNamedIn = (content: string): boolean => botNamePattern?.test(content.replaceAll(codeBlockPattern, "")) ?? false;

trigger.discordEvent("messageCreate", async (message) => {
  if (message.author.id === "1444427058481467462") return;
  if (message.author.bot) return;
  if (!discordClient.user) return;
  if (!message.channel.isTextBased()) return;

  const botUser = discordClient.user;

  // Explicit mentions: DM, real @mention or bot name in the text. Otherwise the AI decides from the conversation context:
  const isExplicitlyMentioned = message.guildId === null || message.mentions.has(botUser.id) || isBotNamedIn(message.content);

  // While the OpenRouter quota is exhausted: canned reply on explicit mention, full silence otherwise:
  if (openRouterQuota.isExhausted()) {
    if (!isExplicitlyMentioned) {
      logger.info(`Skip reply for ${message.author.displayName} (OpenRouter quota exhausted, no explicit mention)`);
      return;
    }

    logger.info(`Reply to ${message.author.displayName} without AI (OpenRouter quota exhausted, explicit mention)`);
    await message.reply(NO_QUOTA_REPLY);
    return;
  }

  logger.info(`Reply evaluation for ${message.author.displayName} (${isExplicitlyMentioned ? "explicit mention" : "ambient"})`);

  const result = await generateReply(message, isExplicitlyMentioned);

  // Usage tracking:
  await modelUsageRepository.track("reply_to_message", result);
});

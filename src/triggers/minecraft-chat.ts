import { replyToMinecraftMessage } from "#/features/reply-to-minecraft-message";
import { getMinecraftBot } from "#/services/minecraft";
import { logger } from "#/utils/logger";

export const setupMinecraftChatListener = () => {
  const bot = getMinecraftBot();

  if (!bot) {
    logger.warn("Cannot setup Minecraft chat listener: bot not connected");
    return;
  }

  bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    const lowerMessage = message.toLowerCase();
    const mentions = ["jp", "jean pascal", "jeanpascal"];

    const isMentioned = mentions.some((mention) => lowerMessage.includes(mention));

    if (!isMentioned) return;

    try {
      const response = await replyToMinecraftMessage(username, message);

      if (response && response.trim().length > 0) {
        bot.chat(response);
      }
    }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error replying to Minecraft message: ${errorMessage}`);
      bot.chat("Désolé, j'ai eu un souci");
    }
  });

  logger.info("Minecraft chat listener setup complete");
};

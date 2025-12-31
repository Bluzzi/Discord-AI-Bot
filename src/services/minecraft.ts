import type { Bot } from "mineflayer";
import { setupMinecraftChatListener } from "#/triggers/minecraft-chat";
import { logger } from "#/utils/logger";
import mineflayer from "mineflayer";

let minecraftBot: Bot | null = null;

export const getMinecraftBot = (): Bot | null => {
  return minecraftBot;
};

export const isMinecraftConnected = (): boolean => {
  return minecraftBot !== null && !minecraftBot._client.ended;
};

export const connectMinecraft = async (host: string, port: number, username = "JeanPascal"): Promise<Bot> => {
  if (isMinecraftConnected()) {
    throw new Error("Already connected to a Minecraft server");
  }

  logger.info(`Connecting to Minecraft server ${host}:${String(port)} as ${username}`);

  minecraftBot = mineflayer.createBot({
    host: host,
    port: port,
    username: username,
  });

  return new Promise((resolve, reject) => {
    if (!minecraftBot) {
      reject(new Error("Failed to create bot"));
      return;
    }

    const bot = minecraftBot;

    const timeout = setTimeout(() => {
      bot.removeAllListeners();
      minecraftBot = null;
      reject(new Error("Connection timeout"));
    }, 30000);

    bot.once("spawn", () => {
      clearTimeout(timeout);
      logger.info(`Connected to Minecraft server ${host}:${String(port)}`);
      setupMinecraftChatListener();
      resolve(bot);
    });

    bot.once("error", (err: Error) => {
      clearTimeout(timeout);
      bot.removeAllListeners();
      minecraftBot = null;
      logger.error(`Minecraft connection error: ${err.message}`);
      reject(err);
    });

    bot.once("kicked", (reason: string) => {
      clearTimeout(timeout);
      bot.removeAllListeners();
      minecraftBot = null;
      logger.warn(`Kicked from Minecraft server: ${reason}`);
      reject(new Error(`Kicked: ${reason}`));
    });

    bot.once("end", () => {
      clearTimeout(timeout);
      bot.removeAllListeners();
      minecraftBot = null;
      logger.info("Disconnected from Minecraft server");
    });
  });
};

export const disconnectMinecraft = (): void => {
  if (minecraftBot) {
    logger.info("Disconnecting from Minecraft server");
    minecraftBot.quit();
    minecraftBot = null;
  }
};

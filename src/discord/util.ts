import type { ClientEvents } from "discord.js";
import { discordClient } from "./client";
import { logger } from "#/utils/logger";

export const discordEvent = <K extends keyof ClientEvents>(
  eventName: K,
  callback: (...args: ClientEvents[K]) => void,
) => {
  discordClient.on(eventName, (...args) => {
    try {
      callback(...args);
    }
    catch (error) {
      logger.error(
        `Discord \`${eventName}\` event error:`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  });
};

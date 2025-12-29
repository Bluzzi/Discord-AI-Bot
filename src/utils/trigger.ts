import type { ClientEvents } from "discord.js";
import { discordClient } from "#/discord";
import { logger } from "#/utils/logger";
import { Cron } from "croner";

const discordEvent = <K extends keyof ClientEvents>(
  eventName: K,
  fn: (...args: ClientEvents[K]) => void,
) => {
  discordClient.on(eventName, (...args) => {
    try {
      fn(...args);
    }
    catch (error) {
      logger.error(
        `Discord \`${eventName}\` event error:`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  });
};

const cron = async (cronName: string, cronPattern: string, fn: () => void, options: { instantTrigger: boolean }) => {
  const job = new Cron(cronPattern, fn, {
    catch: (error) => {
      logger.error(
        `Cron \`${cronName}\` error:`,
        error instanceof Error ? error.stack : String(error),
      );
    },
  });

  if (options.instantTrigger) await job.trigger();
};

export const trigger = { discordEvent, cron };

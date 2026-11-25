import type { ClientEvents } from "discord.js";
import { discordClient } from "#/integrations/discord.client";
import { logger } from "#/utils/logger";
import { Cron } from "croner";

const discordEvent = <K extends keyof ClientEvents>({ eventName, handler, onError }: {
  eventName: K;
  handler: (...args: ClientEvents[K]) => void | Promise<void>;
  onError?: (error: unknown, ...args: ClientEvents[K]) => void | Promise<void>;
}) => {
  // Route event failures to the caller's handler or the default logger:
  discordClient.on(eventName, (...args) => {
    void (async () => {
      try {
        await handler(...args);
      }
      catch (error) {
        if (onError !== undefined) {
          await onError(error, ...args);
          return;
        }
        logger.error(
          `Discord \`${eventName}\` event error:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    })();
  });
};

const cron = async ({ cronName, cronPattern, handler, options }: {
  cronName: string;
  cronPattern: string;
  handler: () => Promise<void> | void;
  options: { triggerAtStartup: boolean };
}) => {
  // Register the schedule and optionally trigger its first run immediately:
  const job = new Cron(cronPattern, async () => handler(), {
    catch: (error) => {
      logger.error(
        `Cron \`${cronName}\` error:`,
        error instanceof Error ? error.stack : String(error),
      );
    },
  });

  if (options.triggerAtStartup) await job.trigger();
};

export const trigger = { discordEvent, cron };

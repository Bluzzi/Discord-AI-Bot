import type { ClientEvents } from "discord.js";
import type { Context } from "hono";
import { discordClient } from "#/discord";
import { logger } from "#/utils/logger";
import { server } from "#/utils/server";
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

const cron = async (
  cronName: string,
  cronPattern: string,
  fn: () => void,
  options: { triggerAtStartup: boolean },
) => {
  const job = new Cron(cronPattern, fn, {
    catch: (error) => {
      logger.error(
        `Cron \`${cronName}\` error:`,
        error instanceof Error ? error.stack : String(error),
      );
    },
  });

  if (options.triggerAtStartup) await job.trigger();
};

const webhook = (
  webhookName: string,
  endpoint: string,
  fn: (ctx: Context) => void | Promise<void>,
) => {
  server.post(endpoint, async (ctx) => {
    try {
      await fn(ctx);
    }
    catch (error) {
      logger.error(
        `Webhook \`${webhookName}\` (POST ${endpoint}) error:`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  });
};

export const trigger = { discordEvent, cron, webhook };

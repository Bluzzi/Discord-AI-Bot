import { serve } from "@hono/node-server";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { Hono } from "hono";

export const server = new Hono();

export const serverStart = async (loadRoutes: () => Promise<void>) => {
  await loadRoutes();

  serve({ fetch: server.fetch, port: env.PORT || 3000 }, (info) => {
    logger.info(`Webhook server listening on http://localhost:${String(info.port)}`);
  });
};

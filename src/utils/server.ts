import { serve } from "@hono/node-server";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { Hono } from "hono";

const app = new Hono();

serve({ fetch: app.fetch, port: env.PORT || 3000 }, (info) => {
  logger.info(`Webhook server listening on http://localhost:${String(info.port)}`);
});

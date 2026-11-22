import { discordClientStart } from "#/integrations/discord";
import { logger } from "#/utils/logger";
import { migratePostgres } from "#/utils/postgres";

// Uncaught exception handler:
process.on("uncaughtException", (error, origin) => {
  logger.error(`Process Exception: ${origin}`, error.stack);
  process.exit(1);
});

// Start services and related triggers:
await migratePostgres();

await discordClientStart(async () => {
  await import("#/triggers/message-create.djs-event");
});

await import("#/triggers/openrouter-quota.cron");

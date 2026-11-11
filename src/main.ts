import { discordClientStart } from "#/services/discord";
import { logger } from "#/utils/logger";

// Uncaught exception handler:
process.on("uncaughtException", (error, origin) => {
  logger.error(`Process Exception: ${origin}`, error.stack);
  process.exit(1);
});

// Start services and related triggers:
await discordClientStart(async () => {
  await import("#/triggers/message-create.djs-event");
  await import("#/triggers/voice-state-update.djs-event");
});

// Load others triggers:
await import("#/triggers/discord-presence.cron");

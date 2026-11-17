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
  await import("#/triggers/message-reaction-add.djs-event");
  await import("#/triggers/voice-state-update.djs-event");
});

// Load others triggers:
// The quota check runs first so every other trigger starts with an up-to-date flag:
await import("#/triggers/openrouter-quota.cron");
await import("#/triggers/discord-presence.cron");
await import("#/triggers/skill-cleanup.cron");

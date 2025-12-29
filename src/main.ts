import { logger } from "./utils/logger";

// Uncaught exception handler:
process.on("uncaughtException", (error, origin) => {
  logger.error(`Process Exception: ${origin}`, error.stack);
  process.exit(1);
});

// Start services:
await import("#/services/discord");
await import("#/services/server");

// Load triggers:
await import("#/triggers/message-create.djs-event");
await import("#/triggers/voice-state-update.djs-event");
await import("#/triggers/discord-presence.cron");

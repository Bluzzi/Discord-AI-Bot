// Env loading:
import { env } from "#/utils/env";

// Imports:
import { discordClient } from "#/discord";
import { logger } from "#/utils/logger";
import { uncaughtExceptionHandler } from "#/utils/process";

// Uncaught exception handler:
uncaughtExceptionHandler();

// Start bot:
await discordClient.login(env.DISCORD_BOT_TOKEN);
logger.info("Bot started!");

// Load triggers:
await import("#/triggers/message-create.djs-event");
await import("#/triggers/voice-state-update.djs-event");
await import("#/triggers/discord-presence.cron");

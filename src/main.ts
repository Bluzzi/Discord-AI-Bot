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

// Load events:
await import("#/events/message-create");
await import("#/events/voice-state-update");

// Load features:
await import("#/features/motd");

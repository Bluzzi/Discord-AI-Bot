// Env loading:
import { env } from "#/utils/env";

// Imports:
import { botDiscord } from "#/utils/discord";
import { logger } from "#/utils/logger";

// Start bot:
await botDiscord.login(env.DISCORD_BOT_TOKEN);
logger.info("Bot started!");

// Load events:
await import("#/events/message-create");

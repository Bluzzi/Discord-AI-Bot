// Env loading:
import { env } from "#/utils/env";

// Imports:
import { discord } from "#/discord";
import { logger } from "#/utils/logger";

// Start bot:
await discord.client.login(env.DISCORD_BOT_TOKEN);
await discord.motd.setup();
logger.info("Bot started!");

// Load events:
await import("#/events/message-create");
await import("#/events/interaction-create");
await import("#/events/voice-presence");

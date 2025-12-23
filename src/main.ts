import { env } from "#/utils/env";
// env
import { botDiscord } from "./utils/discord";
import { logger } from "#/utils/logger";
import "./events/message-create";

await botDiscord.login(env.DISCORD_BOT_TOKEN);

logger.info("Bot started!");

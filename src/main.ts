import { botDiscord } from "./utils/discord";
import { env } from "#/utils/env";
import "./events/message-create";

await botDiscord.login(env.DISCORD_BOT_TOKEN);

console.log("Bot started!");

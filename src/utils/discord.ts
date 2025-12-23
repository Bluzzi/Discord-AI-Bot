import { env } from "#/utils/env";
import { Client, GatewayIntentBits } from "discord.js";

export const botDiscord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

await botDiscord.login(env.DISCORD_BOT_TOKEN);

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { env } from "#/utils/env";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

export const botDiscord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

await botDiscord.login(env.DISCORD_BOT_TOKEN);

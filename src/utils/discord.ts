import { Client, GatewayIntentBits } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

export const botDiscord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

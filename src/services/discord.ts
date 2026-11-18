import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { Client, GatewayIntentBits, Partials } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

// Splits a text into several chunks respecting the Discord message length limit (low-level helper shared by the send tools):
export const splitDiscordMessage = (text: string): string[] => {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += DISCORD_MAX_MESSAGE_LENGTH) {
    chunks.push(text.slice(index, index + DISCORD_MAX_MESSAGE_LENGTH));
  }

  return chunks;
};

// Neutralizes mass-ping mentions into inert text so the bot can never ping everyone in a guild channel (low-level helper shared by the send tools):
export const sanitizeDiscordMessage = (text: string): string => text.replace(/@(everyone|here)/giu, "@{$1}");

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildScheduledEvents,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});

export const discordClientStart = async (loadEvents: () => Promise<void>) => {
  discordClient.once("clientReady", (readyClient) => {
    logger.info(`Discord bot successfully started!! Logged in as ${readyClient.user.tag}`);
  });

  await loadEvents();

  await discordClient.login(env.DISCORD_BOT_TOKEN);
};

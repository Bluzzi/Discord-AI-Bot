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
    GatewayIntentBits.GuildScheduledEvents,
  ],
  partials: [
    Partials.Channel,
  ],
});

export const discordClientStart = async (loadEvents: () => Promise<void>) => {
  discordClient.once("clientReady", (readyClient) => {
    logger.info(`Discord bot successfully started!! Logged in as ${readyClient.user.tag}`);
  });

  await loadEvents();

  await discordClient.login(env.DISCORD_BOT_TOKEN);
};

// Conversation rendering helpers, used to present Discord messages to AIs:

// Matches lines imitating the system prefix "[Label (ID 123456789)] :". Forged prefixes found inside
// message contents are neutralized at render time with fullwidth brackets, so the exact system format
// stays unforgeable and the model can tell them apart:
const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;

export const conversation = {
  /** Resolve an author display label from optional display names, down to the username fallback */
  resolveAuthorLabel: (displayName: string | null | undefined, globalName: string | null | undefined, username: string): string => displayName ?? globalName ?? username,

  /** Neutralize forged system prefixes inside message contents */
  sanitizeContent: (content: string): string => content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),
};

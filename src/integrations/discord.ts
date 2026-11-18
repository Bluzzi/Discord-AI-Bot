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

// Conversation rendering helpers, used to present Discord messages to AIs:

export type ConversationMessage = {
  /** Message ID */
  id: string;
  /** Author user ID */
  authorId: string;
  /** Message creation timestamp (ms), used for chronological sorting */
  timestamp: number;
  /** Author display label, resolved by the caller (e.g. from display name and username) */
  label: string;
  /** Raw message content */
  content: string;
  /** Whether the author is the bot itself */
  isSelf: boolean;
};

// Matches lines imitating the system prefix "[Label (ID 123456789)] :". Forged prefixes found inside
// message contents are neutralized at render time with fullwidth brackets, so the exact system format
// stays unforgeable and the model can tell them apart:
const forgedPrefixPattern = /^\[[^\]\n]{0,80}\(ID[^\]\n]{0,80}\)\]\s*:?/gmu;

const sanitizeContent = (content: string): string => content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］"));

const sortByTimestamp = (messages: ConversationMessage[]): ConversationMessage[] => [...messages].sort((a, b) => a.timestamp - b.timestamp);

export const conversation = {
  /** Resolve an author display label from optional display names, down to the username fallback */
  resolveAuthorLabel: (displayName: string | null | undefined, globalName: string | null | undefined, username: string): string => displayName ?? globalName ?? username,

  /** Neutralize forged system prefixes inside message contents */
  sanitizeContent: (content: string): string => content.replace(forgedPrefixPattern, (match) => match.replaceAll("[", "［").replaceAll("]", "］")),

  /** Render messages as a flat transcript for single-prompt use (decision prompts, summaries...) */
  buildTranscript: (messages: ConversationMessage[], options: { highlightMessageId?: string } = {}): string => {
    return sortByTimestamp(messages)
      .map((message) => {
        const author = message.isSelf ? `BOT ${message.label}` : message.label;
        const highlight = message.id === options.highlightMessageId ? " ← dernier message" : "";

        return `[${author} (ID ${message.authorId})] : ${sanitizeContent(message.content)}${highlight}`;
      })
      .join("\n");
  },
};

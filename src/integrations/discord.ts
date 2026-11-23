import type { AudioResource, VoiceConnection } from "@discordjs/voice";
import type { Guild, GuildBasedChannel, GuildMember, SendableChannels } from "discord.js";
import { createAudioPlayer, getVoiceConnection } from "@discordjs/voice";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { ActivityType, ChannelType, Client, DiscordAPIError, GatewayIntentBits, Partials, PermissionFlagsBits, PermissionsBitField, RESTJSONErrorCodes } from "discord.js";

export const DISCORD_MAX_MESSAGE_LENGTH = 2000;

const splitDiscordText = (text: string, maxLength: number, boundaries: RegExp, continuationPrefix = ""): string[] => {
  const chunks: string[] = [];
  const splitWrappedMatch = (groups: Record<string, string | undefined>, chunkLength: number) => {
    const { fenceOpen, fenceBody, fenceClose, style, styleBody, ticks, inlineBody } = groups;
    const opening = fenceOpen ?? style ?? ticks;
    const closing = fenceClose ?? style ?? ticks;
    const body = fenceBody ?? styleBody ?? inlineBody;
    if (opening === undefined || closing === undefined || body === undefined || body === "") return [];
    const budget = chunkLength - opening.length - closing.length - (fenceOpen === undefined ? 0 : 1);
    if (budget < 2) return [];
    const innerBoundaries = style === undefined ? /\r\n|\s/gu : boundaries;
    return splitDiscordText(body, budget, innerBoundaries).map((part) => {
      if (style === undefined) {
        const newline = fenceOpen !== undefined && !part.endsWith("\n") ? "\n" : "";
        return `${opening}${part}${newline}${closing}`;
      }

      // Discord requires non-whitespace next to emphasis delimiters.
      const content = part.trim();
      if (content === "") return part;
      const leading = part.slice(0, part.length - part.trimStart().length);
      const trailing = part.slice(part.trimEnd().length);
      return `${leading}${opening}${content}${closing}${trailing}`;
    });
  };

  let start = 0;

  while (start < text.length) {
    const prefix = text[start - 1] === "\n" ? continuationPrefix : "";
    const chunkLength = maxLength - prefix.length;
    if (text.length - start <= chunkLength) {
      chunks.push(prefix + text.slice(start));
      break;
    }

    // Set the maximum end of this chunk and start scanning at its first character.
    const limit = start + chunkLength;
    let end = limit;
    let wordBreak = start;
    let lineBreak = start;
    let paragraphBreak = start;
    let wrappedEnd = start;
    let wrapped: string[] = [];
    boundaries.lastIndex = start;

    for (const match of text.matchAll(boundaries)) {
      if (match.index >= limit) break;
      const next = match.index + match[0].length;

      // Move the fallback cut before a match that crosses the limit, if the chunk still contains text.
      if (next > limit) {
        if (match.index > start) {
          end = match.index;
        }
        else if (match.groups !== undefined) {
          wrapped = splitWrappedMatch(match.groups, chunkLength);
          wrappedEnd = next;
        }
        break;
      }

      // Track the last whitespace, line break and paragraph break within the limit.
      if (match[0].trim() !== "") continue;

      wordBreak = next;
      if (match[0].endsWith("\n")) {
        lineBreak = next;
        if (text[match.index - 1] === "\n") paragraphBreak = next;
      }
    }

    // Prefer a paragraph break, then a line break, if it fills at least half the chunk.
    // Otherwise, use the last whitespace or keep the fallback cut.
    if (wrapped.length > 0) {
      for (const [index, part] of wrapped.entries()) chunks.push(index === 0 ? prefix + part : part);
      start = wrappedEnd;
      continue;
    }

    if (paragraphBreak >= start + chunkLength / 2) end = paragraphBreak;
    else if (lineBreak >= start + chunkLength / 2) end = lineBreak;
    else if (wordBreak > start) end = wordBreak;

    // Back up one code unit if the cut would split a surrogate pair.
    const nextCodeUnit = text.charCodeAt(end);
    const previousCodeUnit = text.charCodeAt(end - 1);
    if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF && previousCodeUnit >= 0xD800 && previousCodeUnit <= 0xDBFF) end -= 1;

    // Save the chunk and resume at the cut, preserving the original text.
    chunks.push(prefix + text.slice(start, end));
    start = end;
  }

  return chunks;
};

/**
 * Splits text into Discord messages of up to 2,000 UTF-16 code units.
 * Prefers a paragraph break, then a line break, if it fills at least half the
 * message. Otherwise, uses the last whitespace outside protected Discord syntax.
 * Optionally prefixes continuations after a line or paragraph break with a dot and newline.
 * Reopens oversized fenced code blocks and styled spans in subsequent chunks.
 */
export const splitDiscordMessage = (text: string, { prefixContinuations = false } = {}): string[] => {
  // Match Discord markup before whitespace so its internal spaces cannot become breakpoints.
  const boundaries = /(?<fenceOpen>^ {0,3}`{3,}[^`\r\n]*\r?\n)(?<fenceBody>[\s\S]*?)(?<fenceClose>^ {0,3}`{3,}[\t ]*(?=\r?$))|\[(?:\\[^\r\n]|[^[\]\\\r\n])*\]\((?:<[^>\r\n]+>|(?:\\\S|[^\s()\\]|\([^\s()]*\))+)\)|<https?:\/\/[^\s<>`]+>|https?:\/\/[^\s<>`]+|<(?:@(?:[!&])?\d+|#\d+|a?:[\w]+:\d+|t:-?\d+(?::[tTdDfFsSR])?|\/[\w-]+(?: [\w-]+){0,2}:\d+|id:[\w-]+(?::\d+)?)>|(?<!`)(?<ticks>`+)(?!`)(?<inlineBody>[^\r\n]+?)(?<!`)\k<ticks>(?!`)|\\[^\r\n]|(?<style>\*{1,3}|_{1,3}|~~|\|\|)(?!\s)(?<styleBody>[^\r\n]+?)(?<=\S)\k<style>|\r\n|\s/gmu;
  return splitDiscordText(text, DISCORD_MAX_MESSAGE_LENGTH, boundaries, prefixContinuations ? ".\n" : "");
};

// Neutralizes mass-ping mentions into inert text so the bot can never ping everyone in a guild channel (low-level helper shared by the send tools):
export const sanitizeDiscordMessage = (text: string): string => text.replace(/@(everyone|here)/giu, "@{$1}");

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildScheduledEvents,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});

export const fetchDiscordChannel = async (channelId: string) => {
  const channel = await discordClient.channels.fetch(channelId);
  if (channel === null) {
    throw new Error("Channel not found");
  }
  return channel;
};

export const getDiscordChannelPermissions = (member: GuildMember, channel: GuildBasedChannel) => {
  const effective = new PermissionsBitField(channel.permissionsFor(member.id)?.bitfield);
  const { ViewChannel, ReadMessageHistory, SendMessages, SendMessagesInThreads, ManageThreads, Connect, SetVoiceChannelStatus } = PermissionFlagsBits;
  if (member.isCommunicationDisabled()) effective.remove(effective.bitfield & ~(ViewChannel | ReadMessageHistory));
  if (channel.isVoiceBased() && !effective.has(Connect)) {
    const retained = ViewChannel | (member.voice.channelId === channel.id ? SetVoiceChannelStatus : 0n);
    effective.remove(effective.bitfield & ~retained);
  }
  if (channel.isThread()) {
    effective.remove(SendMessages);
    if (effective.has(SendMessagesInThreads) && (channel.locked !== true || effective.has(ManageThreads))) effective.add(SendMessages);
  }
  return effective;
};

export const requireDiscordChannelPermissions = async (member: GuildMember, channel: GuildBasedChannel, permission: bigint) => {
  if (channel.guildId !== member.guild.id) throw new Error("This Discord channel is outside the requesting member's guild");
  const permissions = getDiscordChannelPermissions(member, channel);
  if (!permissions.has(PermissionFlagsBits.ViewChannel | permission)) {
    throw new Error("The requesting member does not have permission in this Discord channel");
  }
  if (channel.type === ChannelType.PrivateThread && !permissions.has(PermissionFlagsBits.ManageThreads)) {
    await channel.members.fetch({ member: member.id, force: true, cache: false });
  }
};

export const findDiscordGuildMember = async (guild: Guild, userId: string) => {
  try {
    return await guild.members.fetch(userId);
  }
  catch (error) {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return null;
    throw error;
  }
};

export const fetchDiscordTextChannel = async (channelId: string) => {
  const channel = await fetchDiscordChannel(channelId);
  if (!channel.isTextBased()) {
    throw new Error("Channel does not support messages");
  }
  return channel;
};

export const fetchDiscordSendableChannel = async (channelId: string) => {
  const channel = await fetchDiscordChannel(channelId);
  if (!channel.isSendable()) {
    throw new Error("Channel does not support sending messages");
  }
  return channel;
};

export const startDiscordTyping = (channel: SendableChannels, onError: () => void) => {
  const sendTyping = async () => {
    try {
      await channel.sendTyping();
    }
    catch {
      onError();
    }
  };

  void sendTyping();
  const timer = setInterval(() => {
    void sendTyping();
  }, 8_000).unref();
  return () => {
    clearInterval(timer);
  };
};

export const fetchDiscordVoiceConnection = (guildId: string) => {
  const connection = getVoiceConnection(guildId);
  if (connection === undefined) {
    throw new Error("Bot is not connected to voice in this guild");
  }
  return connection;
};

export const getDiscordAudioPlayer = (connection: VoiceConnection) => "subscription" in connection.state ? connection.state.subscription?.player : undefined;

export const replaceDiscordAudio = (connection: VoiceConnection, resource: AudioResource) => {
  const existingPlayer = getDiscordAudioPlayer(connection);
  if (existingPlayer !== undefined) {
    existingPlayer.play(resource);
    return;
  }

  const player = createAudioPlayer();
  player.on("error", (error) => logger.error(`Discord audio playback failed: ${error.message}`));
  player.on("unsubscribe", () => {
    player.stop(true);
  });
  connection.subscribe(player);
  player.play(resource);
};

export const discordClientStart = async (loadEvents: () => Promise<void>) => {
  discordClient.once("clientReady", (readyClient) => {
    readyClient.user.setPresence({
      activities: [{ name: "Custom Status", type: ActivityType.Custom, state: "📜 Je respecte le règlement" }],
    });
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

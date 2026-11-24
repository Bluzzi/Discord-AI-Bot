import type { Guild, GuildBasedChannel, GuildMember } from "discord.js";
import { ChannelType, DiscordAPIError, PermissionFlagsBits, PermissionsBitField, RESTJSONErrorCodes } from "discord.js";

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

      // Move surrounding whitespace outside emphasis delimiters:
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

    // Set the chunk limit and start scanning at its first character:
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

      // Move the cut before a match that crosses the limit:
      if (next > limit && match.index > start) {
        end = match.index;
        break;
      }

      // Split oversized wrapped markup at the beginning of the chunk:
      if (next > limit) {
        if (match.groups !== undefined) {
          wrapped = splitWrappedMatch(match.groups, chunkLength);
          wrappedEnd = next;
        }
        break;
      }

      // Track the last whitespace, line break and paragraph break within the limit:
      if (match[0].trim() !== "") continue;

      wordBreak = next;
      if (match[0].endsWith("\n")) {
        lineBreak = next;
        if (text[match.index - 1] === "\n") paragraphBreak = next;
      }
    }

    // Append the parts of an oversized wrapped span:
    if (wrapped.length > 0) {
      for (const [index, part] of wrapped.entries()) chunks.push(index === 0 ? prefix + part : part);
      start = wrappedEnd;
      continue;
    }

    // Prefer a paragraph or line break that fills at least half the chunk:
    const minimumBreak = start + chunkLength / 2;
    if (wordBreak > start) end = wordBreak;
    if (lineBreak >= minimumBreak) end = lineBreak;
    if (paragraphBreak >= minimumBreak) end = paragraphBreak;

    // Back up one code unit if the cut would split a surrogate pair:
    const nextCodeUnit = text.charCodeAt(end);
    const previousCodeUnit = text.charCodeAt(end - 1);
    if (nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF && previousCodeUnit >= 0xD800 && previousCodeUnit <= 0xDBFF) end -= 1;

    // Save the chunk and resume at the cut:
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
  // Match Discord markup before whitespace to protect internal spaces:
  const boundaries = /(?<fenceOpen>^ {0,3}`{3,}[^`\r\n]*\r?\n)(?<fenceBody>[\s\S]*?)(?<fenceClose>^ {0,3}`{3,}[\t ]*(?=\r?$))|\[(?:\\[^\r\n]|[^[\]\\\r\n])*\]\((?:<[^>\r\n]+>|(?:\\\S|[^\s()\\]|\([^\s()]*\))+)\)|<https?:\/\/[^\s<>`]+>|https?:\/\/[^\s<>`]+|<(?:@(?:[!&])?\d+|#\d+|a?:[\w]+:\d+|t:-?\d+(?::[tTdDfFsSR])?|\/[\w-]+(?: [\w-]+){0,2}:\d+|id:[\w-]+(?::\d+)?)>|(?<!`)(?<ticks>`+)(?!`)(?<inlineBody>[^\r\n]+?)(?<!`)\k<ticks>(?!`)|\\[^\r\n]|(?<style>\*{1,3}|_{1,3}|~~|\|\|)(?!\s)(?<styleBody>[^\r\n]+?)(?<=\S)\k<style>|\r\n|\s/gmu;
  return splitDiscordText(text, DISCORD_MAX_MESSAGE_LENGTH, boundaries, prefixContinuations ? ".\n" : "");
};

// Neutralize mass mentions in outgoing messages:
export const sanitizeDiscordMessage = (text: string): string => text.replace(/@(everyone|here)/giu, "@{$1}");

export const getDiscordChannelPermissions = (member: GuildMember, channel: GuildBasedChannel) => {
  // Resolve effective permissions and apply communication restrictions:
  const effective = new PermissionsBitField(channel.permissionsFor(member.id)?.bitfield);
  const { ViewChannel, ReadMessageHistory, SendMessages, SendMessagesInThreads, ManageThreads, Connect, SetVoiceChannelStatus } = PermissionFlagsBits;
  if (member.isCommunicationDisabled()) effective.remove(effective.bitfield & ~(ViewChannel | ReadMessageHistory));

  // Restrict voice permissions when the member cannot connect:
  if (channel.isVoiceBased() && !effective.has(Connect)) {
    const retained = ViewChannel | (member.voice.channelId === channel.id ? SetVoiceChannelStatus : 0n);
    effective.remove(effective.bitfield & ~retained);
  }

  // Resolve message sending permissions for threads:
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

  // Confirm membership for private threads when required:
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

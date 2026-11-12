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

  /** Render messages as an AI conversation: assistant for the bot, prefixed user messages for the others */
  buildReplyMessages: (messages: ConversationMessage[], options: { highlightMessageId?: string } = {}): { role: "assistant" | "user"; content: string }[] => {
    return sortByTimestamp(messages).map((message) => {
      if (message.isSelf) {
        return { role: "assistant" as const, content: sanitizeContent(message.content) };
      }

      const highlight = message.id === options.highlightMessageId ? "\n(↑ message auquel tu réponds)" : "";

      return {
        role: "user" as const,
        content: `[${message.label} (ID ${message.authorId})] : ${sanitizeContent(message.content)}${highlight}`,
      };
    });
  },
};

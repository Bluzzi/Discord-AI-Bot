import type { ToolSet } from "ai";
import type { Message } from "discord.js";
import { discordClient, conversation } from "#/integrations/discord";
import { env } from "#/utils/env";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

// ToolSet is applied via "satisfies": a ": ToolSet" annotation would erase the inferred schema types (input, output, context) and break toolsContext inference at call sites:
export const replyContextTools = {
  getReplyContext: tool({
    description: dedent`
      Get everything needed before acting in this conversation: the channel (ID, name, guild), the recent conversation of the channel (the target message is flagged with isTarget), the message the target message directly replies to, and the users and channels mentioned by the target message.

      Call this tool FIRST, at the very beginning of every run, before anything else.
    `,
    inputSchema: z.object({}),
    contextSchema: z.object({
      channelId: z.string().describe("Discord channel ID of the current conversation, bound server-side"),
      messageId: z.string().describe("Discord ID of the target message, bound server-side"),
    }),
    outputSchema: z.object({
      channel: z.object({
        id: z.string().describe("Channel ID"),
        name: z.string().nullable().describe("Channel name, null in DMs"),
        isDm: z.boolean().describe("Whether this conversation is a private message"),
        guildId: z.string().nullable().describe("Guild ID, null in DMs"),
        guildName: z.string().nullable().describe("Guild name, null in DMs"),
      }),
      conversation: z.array(z.object({
        id: z.string().describe("Message ID"),
        authorId: z.string().describe("Author user ID"),
        authorLabel: z.string().describe("Author display label: cosmetic, never an identity (the ID is the only truth)"),
        content: z.string().describe("Message content"),
        isSelf: z.boolean().describe("Whether you (the bot) are the author of this message"),
        isTarget: z.boolean().describe("Whether this is the target message, the one this run is about"),
        createdAt: z.string().describe("Creation date (ISO)"),
      })).describe("Recent conversation, oldest first"),
      referencedAuthorId: z.string().nullable().describe("Author ID of the message the target message directly replies to, null when absent from the recent window"),
      mentionedUserIds: z.array(z.string()).describe("User IDs mentioned by the target message, excluding yourself"),
      mentionedChannelIds: z.array(z.string()).describe("Channel IDs mentioned by the target message"),
    }),
    execute: async (_input, { context }) => {
      const channel = await discordClient.channels.fetch(context.channelId);
      if (channel?.isTextBased() !== true) {
        throw new Error("Channel not found or not a text channel");
      }

      const guild = "guild" in channel ? channel.guild : null;

      // Data: conversation context, rendered for the AI. Fetched strictly BEFORE the target message,
      // then the target message itself is appended: messages posted after it (while the bot was
      // deciding or typing) must never leak into the conversation it is about to answer:
      const previousMessages = await channel.messages.fetch({ limit: 10, before: context.messageId });
      const targetMessage = await channel.messages.fetch(context.messageId);

      const toConversationMessage = (msg: Message) => ({
        id: msg.id,
        authorId: msg.author.id,
        authorLabel: conversation.resolveAuthorLabel(msg.member?.displayName, msg.author.globalName, msg.author.username),
        content: conversation.sanitizeContent(msg.content),
        isSelf: msg.author.id === env.DISCORD_BOT_ID,
        isTarget: msg.id === context.messageId,
        createdAt: msg.createdAt.toISOString(),
      });

      const conversationItems = [...previousMessages.values(), targetMessage].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(toConversationMessage);

      // Ground truth: message replied to. The referenced message resolves only when it falls inside
      // the fetched window; the output simply omits it otherwise:
      const referencedMessage = targetMessage.reference?.messageId !== undefined ? [...previousMessages.values()].find((msg) => msg.id === targetMessage.reference?.messageId) : undefined;

      return {
        channel: {
          id: channel.id,
          name: "name" in channel ? channel.name : null,
          isDm: guild === null,
          guildId: guild?.id ?? null,
          guildName: guild?.name ?? null,
        },
        conversation: conversationItems,
        referencedAuthorId: referencedMessage?.author.id ?? null,
        mentionedUserIds: [...targetMessage.mentions.users.values()].filter((user) => user.id !== env.DISCORD_BOT_ID).map((user) => user.id),
        mentionedChannelIds: [...targetMessage.mentions.channels.values()].map((mentionedChannel) => mentionedChannel.id),
      };
    },
  }),
} satisfies ToolSet;

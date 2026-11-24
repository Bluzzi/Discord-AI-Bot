import type { ToolSet } from "ai";
import type { Message } from "discord.js";
import { discordClient, conversation } from "#/integrations/discord";
import { openRouterApi } from "#/integrations/openrouter";
import { env } from "#/utils/env";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const replyContextOutputSchema = z.object({
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
    attachments: z.array(z.object({
      id: z.string(),
      name: z.string(),
      url: z.url(),
      mediaType: z.string().nullable(),
      size: z.number(),
    })).describe("All Discord file attachments on the message"),
    isSelf: z.boolean().describe("Whether you (the bot) are the author of this message"),
    isTarget: z.boolean().describe("Whether this is the target message, the one this run is about"),
    createdAt: z.string().describe("Creation date (ISO)"),
  })).describe("Recent conversation, oldest first"),
  referencedAuthorId: z.string().nullable().describe("Author ID of the message the target message directly replies to, when available"),
  mentionedUserIds: z.array(z.string()).describe("User IDs mentioned by the target message, excluding yourself"),
  mentionedChannelIds: z.array(z.string()).describe("Channel IDs mentioned by the target message"),
});

// ToolSet is applied via "satisfies": a ": ToolSet" annotation would erase the inferred schema types (input, output, context) and break toolsContext inference at call sites:
export const replyContextTools = {
  getReplyContext: tool({
    description: dedent`
      Get the channel, recent messages with their file attachments, and the target message's mentions. The target message is flagged with isTarget.

      Call this tool FIRST, at the very beginning of every run, before anything else.
    `,
    inputSchema: z.object({}),
    contextSchema: z.object({
      channelId: z.string().describe("Discord channel ID of the current conversation, bound server-side"),
      messageId: z.string().describe("Discord ID of the target message, bound server-side"),
    }),
    outputSchema: replyContextOutputSchema,
    toModelOutput: async ({ output }) => {
      const attachments = output.conversation.flatMap((message) => message.attachments);
      const files = attachments.flatMap(({ name, url, mediaType }) => mediaType !== null && supportedImageTypes.has(mediaType) ? [{ type: "file" as const, data: { type: "url" as const, url: new URL(url) }, mediaType, filename: name }] : []);
      if (files.length === 0 || !await openRouterApi.acceptsImages(env.OPENROUTER_MODEL)) {
        return { type: "json", value: output };
      }
      const context = { type: "text" as const, text: JSON.stringify(output) };
      return { type: "content", value: [context, ...files] };
    },
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
        attachments: msg.attachments.map(({ id, name, url, contentType, size }) => ({ id, name, url, mediaType: contentType, size })),
        isSelf: msg.author.id === env.DISCORD_BOT_ID,
        isTarget: msg.id === context.messageId,
        createdAt: msg.createdAt.toISOString(),
      });

      const referencedMessageId = targetMessage.reference?.messageId ?? null;
      const referencedMessage = referencedMessageId === null ? undefined : previousMessages.get(referencedMessageId);
      const conversationItems = [...previousMessages.values(), targetMessage].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(toConversationMessage);

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

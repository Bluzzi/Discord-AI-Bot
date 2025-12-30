import type { ToolSet } from "ai";
import { postgres } from "#/postgres/client";
import {
  tableDiscordGuildMemory,
  tableDiscordUserMemory,
  tableDiscordChannelMemory,
} from "#/postgres/schema";
import { tool } from "ai";
import dedent from "dedent";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const memoryTools: ToolSet = {
  createGuildMemory: tool({
    description: dedent`
      Stores a persistent, guild-specific memory.

      Use only when the information is:
      - durable over time
      - specific to the Discord server
      - useful in future interactions

      Do not store temporary messages or casual discussions.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      memoryText: z.string().describe("Concise, factual, neutral information written in the third person. No emojis, no formatting, no conversational context."),
    }),
    outputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      memoryText: z.string().describe("Stored memory content"),
      createdAt: z.string().describe("ISO date indicating when the memory was created"),
    }),
    execute: async ({ guildID: guildID, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordGuildMemory)
        .values({ guildID, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        guildID: row.guildID,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getGuildMemory: tool({
    description: dedent`
      Retrieves stored memories associated with a Discord guild.

      The assistant must read and use these memories to restore relevant
      server-specific context before responding.

      Returned memories represent persistent knowledge about the server
      and should be treated as factual context unless contradicted.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      limit: z.number().min(1).optional().describe("Maximum number of memory entries to return"),
    }),
    outputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      memories: z.array(z.object({
        memoryText: z.string().describe("Stored memory content"),
        createdAt: z.string().describe("ISO date indicating when the memory was created"),
      })),
      total: z.number().describe("Number of memory entries returned"),
    }),
    execute: async ({ guildID, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordGuildMemory)
        .where(eq(tableDiscordGuildMemory.guildID, guildID))
        .orderBy(desc(tableDiscordGuildMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { guildID, memories, total: memories.length };
    },
  }),

  createUserMemory: tool({
    description: dedent`
      Stores a persistent, user-specific memory.

      Use only when the information is:
      - durable over time
      - specific to a single user
      - useful for future interactions with that user

      Typical examples include user preferences, recurring behaviors,
      or explicitly stated personal information.

      Do not store temporary messages, transient context, emotions,
      or casual conversation.
    `,
    inputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      memoryText: z.string().describe("Concise, factual, neutral information written in the third person. No emojis, no formatting, no conversational context."),
    }),
    outputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      memoryText: z.string().describe("Stored memory content"),
      createdAt: z.string().describe("ISO date indicating when the memory was created"),
    }),
    execute: async ({ userID, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordUserMemory)
        .values({ userID, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        userID: row.userID,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getUserMemory: tool({
    description: dedent`
      Retrieves stored memories associated with a Discord user.

      The assistant must read and use these memories to restore relevant
      user-specific context and preferences before responding.

      Returned memories represent persistent knowledge about the user
      and should be treated as factual context unless contradicted.
    `,
    inputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      limit: z.number().min(1).optional().describe("Maximum number of memory entries to return"),
    }),
    outputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      memories: z.array(
        z.object({
          memoryText: z.string().describe("Stored memory content"),
          createdAt: z.string().describe("ISO date indicating when the memory was created"),
        }),
      ),
      total: z.number().describe("Number of memory entries returned"),
    }),
    execute: async ({ userID, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordUserMemory)
        .where(eq(tableDiscordUserMemory.userID, userID))
        .orderBy(desc(tableDiscordUserMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { userID, memories, total: memories.length };
    },
  }),

  createChannelMemory: tool({
    description: dedent`
      Stores a persistent, channel-specific memory.

      Use only when the information is:
      - durable over time
      - specific to a single Discord channel
      - useful for future interactions within that channel

      Typical examples include channel purpose, usage rules,
      or recurring contextual information.

      Do not store temporary messages, transient context,
      or casual conversation.
    `,
    inputSchema: z.object({
      channelID: z.string().describe("Discord channel ID"),
      memoryText: z.string().describe("Concise, factual, neutral information written in the third person. No emojis, no formatting, no conversational context."),
    }),
    outputSchema: z.object({
      channelID: z.string().describe("Discord channel ID"),
      memoryText: z.string().describe("Stored memory content"),
      createdAt: z.string().describe("ISO date indicating when the memory was created"),
    }),
    execute: async ({ channelID, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordChannelMemory)
        .values({ channelID, memoryText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        channelID: row.channelID,
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  getChannelMemory: tool({
    description: dedent`
      Retrieves stored memories associated with a Discord channel.

      The assistant must read and use these memories to restore relevant
      channel-specific context before responding.

      Returned memories represent persistent knowledge about the channel
      and should be treated as factual context unless contradicted.
    `,
    inputSchema: z.object({
      channelID: z.string().describe("Discord channel ID"),
      limit: z.number().min(1).optional().describe("Maximum number of memory entries to return"),
    }),
    outputSchema: z.object({
      channelID: z.string().describe("Discord channel ID"),
      memories: z.array(
        z.object({
          memoryText: z.string().describe("Stored memory content"),
          createdAt: z.string().describe("ISO date indicating when the memory was created"),
        }),
      ),
      total: z.number().describe("Number of memory entries returned"),
    }),
    execute: async ({ channelID, limit = 50 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordChannelMemory)
        .where(eq(tableDiscordChannelMemory.channelID, channelID))
        .orderBy(desc(tableDiscordChannelMemory.createdAt))
        .limit(limit);

      const memories = rows.map((row) => ({
        memoryText: row.memoryText,
        createdAt: row.createdAt.toISOString(),
      }));

      return { channelID, memories, total: memories.length };
    },
  }),
};

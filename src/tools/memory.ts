import type { ToolSet } from "ai";
import { postgres } from "#/postgres/client";
import { tableDiscordUserMemory } from "#/postgres/schema";
import { tool } from "ai";
import dedent from "dedent";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const memoryTools: ToolSet = {
  getUserMemory: tool({
    description: dedent`
      Retrieves the persistent memory associated with a Discord user.

      The memory is a single consolidated text containing durable information
      about the user: preferences, habits, personal facts, implicit rules.

      The assistant must read and use this memory to restore relevant
      user-specific context and personalize its response.

      Returns null values if no memory exists yet for this user.
    `,
    inputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
    }),
    outputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      memoryText: z.string().nullable().describe("Stored memory content, null if no memory exists yet"),
      updatedAt: z.string().nullable().describe("ISO date indicating when the memory was last updated, null if no memory exists yet"),
    }),
    execute: async ({ userID }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordUserMemory)
        .where(eq(tableDiscordUserMemory.userID, userID))
        .limit(1);

      const row = rows[0];
      if (!row) return { userID, memoryText: null, updatedAt: null };

      return {
        userID: row.userID,
        memoryText: row.memoryText,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),

  updateUserMemory: tool({
    description: dedent`
      Creates or replaces the persistent memory of a Discord user (upsert).

      ALWAYS call getUserMemory first, then rewrite the COMPLETE memory by:
      - integrating new durable information about the user
      - keeping existing information that is still relevant
      - removing information that is obsolete or contradicted

      Use only for durable information: preferences, recurring behaviors,
      explicitly stated personal facts, useful for future interactions.

      Do not store temporary messages, transient context, emotions,
      or casual conversation.

      The memory must stay concise, factual, neutral, written in the third
      person, without emojis or formatting.
    `,
    inputSchema: z.object({
      userID: z.string().describe("Discord user ID, the information saved must relate to this user only."),
      memoryText: z.string().min(1).max(4000).describe("Complete updated memory content, merging new durable information with the existing one."),
    }),
    outputSchema: z.object({
      userID: z.string().describe("Discord user ID"),
      memoryText: z.string().describe("Stored memory content"),
      updatedAt: z.string().describe("ISO date indicating when the memory was last updated"),
    }),
    execute: async ({ userID, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordUserMemory)
        .values({ userID, memoryText })
        .onConflictDoUpdate({
          target: tableDiscordUserMemory.userID,
          set: { memoryText, updatedAt: new Date() },
        })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Upsert failed");

      return {
        userID: row.userID,
        memoryText: row.memoryText,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),
};

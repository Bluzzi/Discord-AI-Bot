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
      Retrieve the persistent memory of a Discord user: a single consolidated text with durable information about them (preferences, habits, personal facts).

      Returns null values if no memory exists yet for this user.
    `,
    inputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
      memoryText: z.string().nullable().describe("Stored memory content, null if no memory exists yet"),
      updatedAt: z.string().nullable().describe("Last update date (ISO), null if no memory exists yet"),
    }),
    execute: async ({ userId }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordUserMemory)
        .where(eq(tableDiscordUserMemory.userID, userId))
        .limit(1);

      const row = rows[0];
      if (!row) {
        return { userId, memoryText: null, updatedAt: null };
      }

      return {
        userId: row.userID,
        memoryText: row.memoryText,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),

  updateUserMemory: tool({
    description: dedent`
      Create or replace the persistent memory of a Discord user (upsert).

      ALWAYS call getUserMemory first, then rewrite the COMPLETE memory: integrate new durable information, keep what is still relevant, remove what is obsolete or contradicted.

      Store only durable information: preferences, recurring behaviors, explicitly stated personal facts. Never store transient context or casual conversation.

      The memory must stay concise, factual, neutral, written in the third person, without emojis or formatting.
    `,
    inputSchema: z.object({
      userId: z.string().describe("Discord user ID the stored information relates to"),
      memoryText: z.string().min(1).max(4000).describe("Complete updated memory content, merging new durable information with the existing one"),
    }),
    outputSchema: z.object({
      userId: z.string().describe("Discord user ID"),
      memoryText: z.string().describe("Stored memory content"),
      updatedAt: z.string().describe("Last update date (ISO)"),
    }),
    execute: async ({ userId, memoryText }) => {
      const rows = await postgres
        .insert(tableDiscordUserMemory)
        .values({ userID: userId, memoryText })
        .onConflictDoUpdate({
          target: tableDiscordUserMemory.userID,
          set: { memoryText, updatedAt: new Date() },
        })
        .returning();

      const row = rows[0];
      if (!row) {
        throw new Error("Memory upsert failed");
      }

      return {
        userId: row.userID,
        memoryText: row.memoryText,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),
};

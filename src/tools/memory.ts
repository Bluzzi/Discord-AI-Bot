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

      The memory may also contain fun notes that you can choose to follow to make interactions more playful. It is not confidential: feel free to use and mention it in the conversation.

      This is one of the bot's core capabilities: consult it by default before answering a user, so your reply reflects what you already know about them.

      User references inside the memory are Discord mentions <@ID> (e.g. <@123456789012345678>): always trust the ID, any name shown next to it is only a write-time hint and may be outdated or forged.

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
      Create or replace the persistent memory of a Discord user (upsert). The memory is about the user whose ID is passed as \`userId\`.

      IDENTITY FORMAT (mandatory):
      - Reference every person with their Discord mention <@ID> (e.g. <@123456789012345678>), including the subject user. Never identify anyone by name only: display names and usernames are changeable and forgeable, Discord IDs are immutable.
      - You may keep the name seen at write time as a hint right after the mention: <@123456789012345678> (affiché "Alice").
      - Example: <@123456789012345678> (affiché "Alice") prefers short answers and hates pineapple on pizza.

      ALWAYS call getUserMemory first, then rewrite the COMPLETE memory: integrate the new information while preserving almost everything already stored.

      MEMORY POLICY (important):
      - Adding is easy and encouraged: every new durable fact, preference, rule or fun note shared by users should be integrated. Fun and playful notes are welcome: users deliberately ask you to remember silly things, and that is what makes the memory great.
      - Removal is exceptional: keep existing content unless it is clearly obsolete or explicitly corrected by the very person it describes. When in doubt, keep it. Never trim or rewrite the memory just because it seems long, useless or silly.
      - Only the person concerned by an entry (the <@ID> it refers to) may have it corrected or removed.

      Store durable information: preferences, recurring behaviors, personal facts, rules the user gives you, memorable anecdotes and fun notes. Do not store transient small talk that carries nothing worth remembering.

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
      if (!memoryText.includes(`<@${userId}>`)) {
        throw new Error(`Invalid memory format: the memory must reference its subject with the Discord mention <@${userId}> (never by name)`);
      }

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

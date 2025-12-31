import type { ToolSet } from "ai";
import { postgres } from "#/postgres/client";
import { tableDiscordGuildLaw } from "#/postgres/schema";
import { tool } from "ai";
import dedent from "dedent";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const guildLawTools: ToolSet = {
  createGuildLaw: tool({
    description: dedent`
      Creates a new guild law with a unique identifier code.

      Use when establishing formal rules or regulations for a Discord server.

      The law code should be a short, unique identifier (e.g., "LAW-001", "RULE-SPAM").
      The law text should contain the complete rule as written by the user.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID where the law applies"),
      lawCode: z.string().describe("Unique identifier code for this law (e.g., 'LAW-001', 'RULE-SPAM')"),
      lawText: z.string().describe("Complete text of the law as written by the user"),
    }),
    outputSchema: z.object({
      lawCode: z.string().describe("Unique law identifier"),
      lawText: z.string().describe("Complete law text"),
      guildID: z.string().describe("Discord guild ID"),
      createdAt: z.string().describe("ISO date indicating when the law was created"),
    }),
    execute: async ({ guildID, lawCode, lawText }) => {
      const rows = await postgres
        .insert(tableDiscordGuildLaw)
        .values({ guildID, lawCode, lawText })
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Insert failed");

      return {
        lawCode: row.lawCode,
        lawText: row.lawText,
        guildID: row.guildID,
        createdAt: row.createdAt.toISOString(),
      };
    },
  }),

  updateGuildLaw: tool({
    description: dedent`
      Updates an existing guild law identified by its code.

      Use when modifying the text of an existing rule or regulation.

      The law code must exist in the guild's law database.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID where the law exists"),
      lawCode: z.string().describe("Unique identifier code of the law to update"),
      lawText: z.string().describe("New complete text of the law"),
    }),
    outputSchema: z.object({
      lawCode: z.string().describe("Unique law identifier"),
      lawText: z.string().describe("Updated law text"),
      guildID: z.string().describe("Discord guild ID"),
      updatedAt: z.string().describe("ISO date indicating when the law was last updated"),
    }),
    execute: async ({ guildID, lawCode, lawText }) => {
      const rows = await postgres
        .update(tableDiscordGuildLaw)
        .set({ lawText, updatedAt: new Date() })
        .where(
          and(
            eq(tableDiscordGuildLaw.lawCode, lawCode),
            eq(tableDiscordGuildLaw.guildID, guildID),
          ),
        )
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Law not found or update failed");

      return {
        lawCode: row.lawCode,
        lawText: row.lawText,
        guildID: row.guildID,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),

  deleteGuildLaw: tool({
    description: dedent`
      Deletes a guild law identified by its code.

      Use when removing a rule or regulation from the guild's law database.

      This action is permanent and cannot be undone.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID where the law exists"),
      lawCode: z.string().describe("Unique identifier code of the law to delete"),
    }),
    outputSchema: z.object({
      lawCode: z.string().describe("Deleted law identifier"),
      guildID: z.string().describe("Discord guild ID"),
      success: z.boolean().describe("Whether the deletion was successful"),
    }),
    execute: async ({ guildID, lawCode }) => {
      const rows = await postgres
        .delete(tableDiscordGuildLaw)
        .where(
          and(
            eq(tableDiscordGuildLaw.lawCode, lawCode),
            eq(tableDiscordGuildLaw.guildID, guildID),
          ),
        )
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Law not found or delete failed");

      return {
        lawCode: row.lawCode,
        guildID: row.guildID,
        success: true,
      };
    },
  }),

  getGuildLaw: tool({
    description: dedent`
      Retrieves a specific guild law by its code.

      Use to look up the details of a particular rule or regulation.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      lawCode: z.string().describe("Unique identifier code of the law to retrieve"),
    }),
    outputSchema: z.object({
      lawCode: z.string().describe("Unique law identifier"),
      lawText: z.string().describe("Complete law text"),
      guildID: z.string().describe("Discord guild ID"),
      createdAt: z.string().describe("ISO date indicating when the law was created"),
      updatedAt: z.string().describe("ISO date indicating when the law was last updated"),
    }),
    execute: async ({ guildID, lawCode }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordGuildLaw)
        .where(
          and(
            eq(tableDiscordGuildLaw.lawCode, lawCode),
            eq(tableDiscordGuildLaw.guildID, guildID),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) throw new Error("Law not found");

      return {
        lawCode: row.lawCode,
        lawText: row.lawText,
        guildID: row.guildID,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  }),

  getAllGuildLaws: tool({
    description: dedent`
      Retrieves all laws for a Discord guild.

      The assistant must read and use these laws to understand
      the server's rules and regulations before responding.

      Returned laws represent the formal governance structure
      of the server and should be treated as authoritative.
    `,
    inputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      limit: z.number().min(1).optional().describe("Maximum number of laws to return"),
    }),
    outputSchema: z.object({
      guildID: z.string().describe("Discord guild ID"),
      laws: z.array(
        z.object({
          lawCode: z.string().describe("Unique law identifier"),
          lawText: z.string().describe("Complete law text"),
          createdAt: z.string().describe("ISO date indicating when the law was created"),
          updatedAt: z.string().describe("ISO date indicating when the law was last updated"),
        }),
      ),
      total: z.number().describe("Number of laws returned"),
    }),
    execute: async ({ guildID, limit = 100 }) => {
      const rows = await postgres
        .select()
        .from(tableDiscordGuildLaw)
        .where(eq(tableDiscordGuildLaw.guildID, guildID))
        .orderBy(desc(tableDiscordGuildLaw.createdAt))
        .limit(limit);

      const laws = rows.map((row) => ({
        lawCode: row.lawCode,
        lawText: row.lawText,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }));

      return { guildID, laws, total: laws.length };
    },
  }),
};

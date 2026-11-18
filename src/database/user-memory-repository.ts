import { postgres } from "#/database/client";
import { tableDiscordUserMemory } from "#/database/schema";
import { desc, eq } from "drizzle-orm";

export type UserMemory = {
  userId: string;
  memoryText: string;
  updatedAt: Date;
};

export const userMemoryRepository = {
  /** Full memory of one user, null when none exists yet */
  get: async (userId: string): Promise<UserMemory | null> => {
    const rows = await postgres
      .select()
      .from(tableDiscordUserMemory)
      .where(eq(tableDiscordUserMemory.userID, userId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return { userId: row.userID, memoryText: row.memoryText, updatedAt: row.updatedAt };
  },

  /** The most recently updated memories, newest first (community-level questions) */
  listRecent: async (limit = 10): Promise<UserMemory[]> => {
    const rows = await postgres
      .select()
      .from(tableDiscordUserMemory)
      .orderBy(desc(tableDiscordUserMemory.updatedAt))
      .limit(limit);

    return rows.map((row) => ({ userId: row.userID, memoryText: row.memoryText, updatedAt: row.updatedAt }));
  },

  /** Upsert the consolidated memory text (the curator reconciles before writing) */
  save: async ({ userId, memoryText }: { userId: string; memoryText: string }): Promise<UserMemory> => {
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
      throw new Error("User memory save failed");
    }

    return { userId: row.userID, memoryText: row.memoryText, updatedAt: row.updatedAt };
  },
};

import { columns } from "./column";
import { pgTable, text } from "drizzle-orm/pg-core";

export const tableDiscordUserMemory = pgTable("discord_user_memory", {
  userID: text("user_id").primaryKey(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

import { columns } from "./column";
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const tableDiscordGuildMemory = pgTable("discord_guild_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  guildID: text("guild_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const tableDiscordUserMemory = pgTable("discord_user_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  userID: text("user_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const tableDiscordChannelMemory = pgTable("discord_channel_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  channelID: text("channel_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

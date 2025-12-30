import { columns } from "./column";
import { pgTable, uuid, text } from "drizzle-orm/pg-core";

export const tableDiscordGuildLaw = pgTable("discord_guild_law", {
  lawCode: text("law_code").primaryKey(),
  lawText: text("law_text").notNull(),

  guildID: text("channel_id").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const tableDiscordGuildMemory = pgTable("discord_guild_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  guildID: text("guild_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  deletedAt: columns.deletedAt,
});

export const tableDiscordUserMemory = pgTable("discord_user_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  userID: text("user_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  deletedAt: columns.deletedAt,
});

export const tableDiscordChannelMemory = pgTable("discord_channel_memory", {
  id: uuid("id").primaryKey().defaultRandom(),

  channelID: text("channel_id").notNull(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  deletedAt: columns.deletedAt,
});

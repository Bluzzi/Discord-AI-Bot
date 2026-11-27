import { columns } from "#/integrations/postgres.helper-timestamps";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const defaultDiscordGuildTimezone = "Europe/Paris";

export const tableDiscordGuild = pgTable("discord_guild", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id").notNull().unique(),
  guildName: text("guild_name").notNull(),
  timezone: text("timezone").notNull().default(defaultDiscordGuildTimezone),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

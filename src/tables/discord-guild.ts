import { columns } from "#/integrations/postgres.helper-timestamps";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const tableDiscordGuild = pgTable("discord_guild", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id").notNull().unique(),
  guildName: text("guild_name").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

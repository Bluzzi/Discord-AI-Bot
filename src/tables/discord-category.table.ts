import { columns } from "#/integrations/postgres.helper-timestamps";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const tableDiscordCategory = pgTable("discord_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: uuid("guild_id").notNull().references(() => tableDiscordGuild.id),
  categoryId: text("category_id").notNull().unique(),
  categoryName: text("category_name").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
}, (table) => [
  unique().on(table.id, table.guildId),
]);

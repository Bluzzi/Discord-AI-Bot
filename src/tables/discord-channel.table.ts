import { columns } from "#/integrations/postgres.helper-timestamps";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { foreignKey, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const tableDiscordChannel = pgTable("discord_channel", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: uuid("guild_id").notNull().references(() => tableDiscordGuild.id),
  categoryId: uuid("category_id"),
  channelId: text("channel_id").notNull().unique(),
  channelName: text("channel_name").notNull(),
  channelType: text("channel_type").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
}, (table) => [
  unique().on(table.id, table.guildId),
  foreignKey({
    name: "discord_channel_category_fk",
    columns: [table.categoryId, table.guildId],
    foreignColumns: [tableDiscordCategory.id, tableDiscordCategory.guildId],
  }),
]);

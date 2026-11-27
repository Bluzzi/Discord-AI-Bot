import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { foreignKey, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tableDiscordMessage = pgTable("discord_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: uuid("guild_id").notNull().references(() => tableDiscordGuild.id),
  channelId: uuid("channel_id").notNull(),
  memberId: uuid("member_id").notNull(),
  messageId: text("message_id").notNull().unique(),
  messageContent: text("message_content").notNull(),

  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  foreignKey({
    name: "discord_message_channel_fk",
    columns: [table.channelId, table.guildId],
    foreignColumns: [tableDiscordChannel.id, tableDiscordChannel.guildId],
  }),
  foreignKey({
    name: "discord_message_member_fk",
    columns: [table.memberId, table.guildId],
    foreignColumns: [tableDiscordMember.id, tableDiscordMember.guildId],
  }),
]);

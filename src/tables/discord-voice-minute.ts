import { tableDiscordChannel } from "#/tables/discord-channel";
import { tableDiscordGuild } from "#/tables/discord-guild";
import { tableDiscordMember } from "#/tables/discord-member";
import { sql } from "drizzle-orm";
import { foreignKey, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const tableDiscordVoiceMinute = pgTable("discord_voice_minute", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: uuid("guild_id").notNull().references(() => tableDiscordGuild.id),
  channelId: uuid("channel_id").notNull(),
  memberId: uuid("member_id").notNull(),

  createdAt: timestamp("created_at", { precision: 0 })
    .notNull()
    .default(sql`date_trunc('second', statement_timestamp() at time zone 'UTC')`),
}, (table) => [
  foreignKey({
    name: "discord_voice_minute_channel_fk",
    columns: [table.channelId, table.guildId],
    foreignColumns: [tableDiscordChannel.id, tableDiscordChannel.guildId],
  }),
  foreignKey({
    name: "discord_voice_minute_member_fk",
    columns: [table.memberId, table.guildId],
    foreignColumns: [tableDiscordMember.id, tableDiscordMember.guildId],
  }),
  unique().on(table.memberId, table.createdAt),
]);

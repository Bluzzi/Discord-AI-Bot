import { columns } from "#/integrations/postgres.helper-timestamps";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const discordMemberTypeEnum = pgEnum("discord_member_type", ["human", "bot"]);

export const tableDiscordMember = pgTable("discord_member", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: uuid("guild_id").notNull().references(() => tableDiscordGuild.id),
  userId: text("user_id").notNull(),
  memberName: text("member_name"),
  userName: text("user_name"),
  userTag: text("user_tag").notNull(),
  userProfilePicture: text("user_profile_picture"),
  memberType: discordMemberTypeEnum("member_type").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
}, (table) => [
  unique().on(table.id, table.guildId),
  unique().on(table.guildId, table.userId),
]);

import type { tableDiscordMember } from "#/tables/discord-member.table";
import type { GuildMember } from "discord.js";

export const getDiscordMemberMetadata = (member: GuildMember): Omit<typeof tableDiscordMember.$inferInsert, "guildId" | "id" | "userId" | "createdAt" | "updatedAt"> => ({
  memberName: member.nickname,
  userName: member.user.globalName,
  userTag: member.user.username,
  userProfilePicture: member.user.avatarURL(),
  memberType: member.user.bot ? "bot" : "human",
});

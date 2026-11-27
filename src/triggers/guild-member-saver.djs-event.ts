import type { GuildMember, PartialGuildMember } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordGuild } from "#/tables/discord-guild";
import { tableDiscordMember } from "#/tables/discord-member";
import { trigger } from "#/utils/trigger";
import { sql } from "drizzle-orm";

const saveMember = async (member: GuildMember | PartialGuildMember) => {
  if (member.partial) return;
  // Seed the guild if the member arrives before the startup inventory:
  const [guildRow] = await postgres.insert(tableDiscordGuild)
    .values({ guildId: member.guild.id, guildName: member.guild.name })
    .onConflictDoUpdate({
      target: tableDiscordGuild.guildId,
      set: { updatedAt: sql`${tableDiscordGuild.updatedAt}` },
    }).returning({ id: tableDiscordGuild.id });

  // Save the server nickname and the member's profile:
  const memberName = member.nickname;
  const userName = member.user.globalName;
  const userTag = member.user.username;
  const userProfilePicture = member.user.avatarURL();
  const memberType = member.user.bot ? "bot" : "human";
  await postgres.insert(tableDiscordMember)
    .values({ guildId: guildRow!.id, userId: member.id, memberName, userName, userTag, userProfilePicture, memberType })
    .onConflictDoUpdate({
      target: [tableDiscordMember.guildId, tableDiscordMember.userId],
      set: { memberName, userName, userTag, userProfilePicture, memberType },
      setWhere: sql`(${tableDiscordMember.memberName}, ${tableDiscordMember.userName}, ${tableDiscordMember.userTag}, ${tableDiscordMember.userProfilePicture}, ${tableDiscordMember.memberType})
        is distinct from (excluded.member_name, excluded.user_name, excluded.user_tag, excluded.user_profile_picture, excluded.member_type)`,
    });
};

trigger.discordEvent({ eventName: "guildMemberAdd", handler: saveMember });
trigger.discordEvent({ eventName: "guildMemberAvailable", handler: saveMember });

trigger.discordEvent({
  eventName: "guildMemberUpdate",
  handler: async (oldMember, member) => {
    if (!oldMember.partial && oldMember.nickname === member.nickname) return;
    await saveMember(member);
  },
});

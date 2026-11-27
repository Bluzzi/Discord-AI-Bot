import type { GuildMember, PartialGuildMember } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { ensureDiscordGuild } from "#/tables/discord-guild.helper";
import { getDiscordMemberMetadata } from "#/tables/discord-member.helper";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { trigger } from "#/utils/trigger";
import { sql } from "drizzle-orm";

const saveMember = async (member: GuildMember | PartialGuildMember) => {
  if (member.partial) return;
  // Seed the guild if the member arrives before the startup inventory:
  const guildId = await ensureDiscordGuild(member.guild);

  // Save the server nickname and the member's profile:
  const metadata = getDiscordMemberMetadata(member);
  await postgres.insert(tableDiscordMember)
    .values({ guildId, userId: member.id, ...metadata })
    .onConflictDoUpdate({
      target: [tableDiscordMember.guildId, tableDiscordMember.userId],
      set: metadata,
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

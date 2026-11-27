import { discordClient } from "#/integrations/discord.client";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { tableDiscordVoiceMinute } from "#/tables/discord-voice-minute.table";
import { completedVoiceMinutes, guildSessions, minuteInMs } from "#/triggers/voice-state-update.djs-event";
import { trigger } from "#/utils/trigger";
import { ChannelType } from "discord.js";
import { sql } from "drizzle-orm";
import { performance } from "node:perf_hooks";

await trigger.cron({
  cronName: "discord-voice-minute",
  cronPattern: "* * * * * *",
  options: { triggerAtStartup: false },
  handler: async () => {
    // Include minutes completed just before a member left or switched channels:
    const completed = completedVoiceMinutes.splice(0);
    const now = performance.now();
    for (const [guildId, sessions] of guildSessions) {
      const guild = discordClient.guilds.cache.get(guildId);
      if (guild?.available !== true) continue;
      for (const [userId, session] of sessions) {
        if (session.nextMinuteAt > now) continue;
        session.nextMinuteAt += minuteInMs;
        completed.push({ guild, userId, channelId: session.channelId });
      }
    }

    await Promise.all(completed.map(async ({ guild, userId, channelId }) => {
      // Seed missing references without overwriting metadata maintained by Discord events:
      const channel = guild.channels.cache.get(channelId);
      if (channel?.isVoiceBased() !== true) return;
      const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId);
      const [guildRow] = await postgres.insert(tableDiscordGuild)
        .values({ guildId: guild.id, guildName: guild.name })
        .onConflictDoUpdate({
          target: tableDiscordGuild.guildId,
          set: { updatedAt: sql`${tableDiscordGuild.updatedAt}` },
        }).returning({ id: tableDiscordGuild.id });
      const guildId = guildRow!.id;
      const category = channel.parent;
      const categoryRows = category === null ? [] : await postgres.insert(tableDiscordCategory)
        .values({ guildId, categoryId: category.id, categoryName: category.name })
        .onConflictDoUpdate({
          target: tableDiscordCategory.categoryId,
          set: { updatedAt: sql`${tableDiscordCategory.updatedAt}` },
        }).returning({ id: tableDiscordCategory.id });
      const [[channelRow], [memberRow]] = await Promise.all([
        postgres.insert(tableDiscordChannel).values({
          guildId,
          categoryId: categoryRows[0]?.id ?? null,
          channelId: channel.id,
          channelName: channel.name,
          channelType: ChannelType[channel.type],
        }).onConflictDoUpdate({
          target: tableDiscordChannel.channelId,
          set: { updatedAt: sql`${tableDiscordChannel.updatedAt}` },
        }).returning({ id: tableDiscordChannel.id }),
        postgres.insert(tableDiscordMember).values({
          guildId,
          userId: member.id,
          memberName: member.nickname,
          userName: member.user.globalName,
          userTag: member.user.username,
          userProfilePicture: member.user.avatarURL(),
          memberType: member.user.bot ? "bot" : "human",
        }).onConflictDoUpdate({
          target: [tableDiscordMember.guildId, tableDiscordMember.userId],
          set: { updatedAt: sql`${tableDiscordMember.updatedAt}` },
        }).returning({ id: tableDiscordMember.id }),
      ]);

      // Use the insertion time and deduplicate entries for the same member and second:
      await postgres.insert(tableDiscordVoiceMinute).values({
        guildId,
        channelId: channelRow!.id,
        memberId: memberRow!.id,
      }).onConflictDoNothing({
        target: [tableDiscordVoiceMinute.memberId, tableDiscordVoiceMinute.createdAt],
      });
    }));
  },
});

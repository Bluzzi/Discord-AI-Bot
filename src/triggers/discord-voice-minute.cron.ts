import { discordClient } from "#/integrations/discord.client";
import { postgres } from "#/integrations/postgres.client";
import { ensureDiscordChannelAndMember } from "#/tables/discord-channel.helper";
import { tableDiscordVoiceMinute } from "#/tables/discord-voice-minute.table";
import { completedVoiceMinutes, guildSessions, minuteInMs } from "#/triggers/voice-state-update.djs-event";
import { trigger } from "#/utils/trigger";
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
      const { guildId, channelId: storedChannelId, memberId } = await ensureDiscordChannelAndMember(channel, member);

      // Use the insertion time and deduplicate entries for the same member and second:
      await postgres.insert(tableDiscordVoiceMinute).values({
        guildId,
        channelId: storedChannelId,
        memberId,
      }).onConflictDoNothing({
        target: [tableDiscordVoiceMinute.memberId, tableDiscordVoiceMinute.createdAt],
      });
    }));
  },
});

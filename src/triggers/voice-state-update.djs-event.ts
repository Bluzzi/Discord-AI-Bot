import type { Guild } from "discord.js";
import { discordClient } from "#/integrations/discord.client";
import { trigger } from "#/utils/trigger";
import { performance } from "node:perf_hooks";

export const minuteInMs = 60_000;
const disconnectedShards = new Set<number>();
export const guildSessions = new Map<string, Map<string, { channelId: string; nextMinuteAt: number }>>();
export const completedVoiceMinutes: { guild: Guild; userId: string; channelId: string }[] = [];

const seedVoiceSessions = (guild: Guild) => {
  // Start timing members already in voice without assuming when they joined:
  if (!guild.available || disconnectedShards.has(guild.shardId) || guildSessions.has(guild.id)) return;
  const nextMinuteAt = performance.now() + minuteInMs;
  const sessions = new Map<string, { channelId: string; nextMinuteAt: number }>();
  for (const state of guild.voiceStates.cache.values()) {
    if (state.channelId !== null) sessions.set(state.id, { channelId: state.channelId, nextMinuteAt });
  }
  guildSessions.set(guild.id, sessions);
};

trigger.discordEvent({
  eventName: "voiceStateUpdate",
  handler: (oldState, state) => {
    // Count time in one channel; toggling mute, camera or streaming does not reset it:
    const { channelId, guild, id } = state;
    if (oldState.channelId === channelId || !guild.available || disconnectedShards.has(guild.shardId)) return;
    seedVoiceSessions(guild);
    const sessions = guildSessions.get(guild.id)!;
    const previousSession = sessions.get(id);
    const now = performance.now();
    if (channelId === null) sessions.delete(id);
    if (channelId !== null) sessions.set(id, { channelId, nextMinuteAt: now + minuteInMs });

    // Credit a full minute completed just before the member left or switched channels:
    if (previousSession !== undefined && previousSession.nextMinuteAt <= now) {
      completedVoiceMinutes.push({ guild, userId: id, channelId: previousSession.channelId });
    }
  },
});

trigger.discordEvent({ eventName: "guildCreate", handler: seedVoiceSessions });
trigger.discordEvent({ eventName: "guildAvailable", handler: seedVoiceSessions });
const clearGuildSessions = (guild: Guild) => {
  guildSessions.delete(guild.id);
};
trigger.discordEvent({ eventName: "guildDelete", handler: clearGuildSessions });
trigger.discordEvent({ eventName: "guildUnavailable", handler: clearGuildSessions });

const clearShardSessions = (shardId: number) => {
  // Never count time when the bot cannot observe joins and leaves:
  disconnectedShards.add(shardId);
  for (const guild of discordClient.guilds.cache.values()) {
    if (guild.shardId === shardId) guildSessions.delete(guild.id);
  }
};

const seedShardSessions = (shardId: number) => {
  disconnectedShards.delete(shardId);
  for (const guild of discordClient.guilds.cache.values()) {
    if (guild.shardId === shardId) seedVoiceSessions(guild);
  }
};

trigger.discordEvent({ eventName: "shardReconnecting", handler: clearShardSessions });
trigger.discordEvent({
  eventName: "shardDisconnect",
  handler: (_event, shardId) => {
    clearShardSessions(shardId);
  },
});
trigger.discordEvent({ eventName: "shardReady", handler: seedShardSessions });
trigger.discordEvent({ eventName: "shardResume", handler: seedShardSessions });

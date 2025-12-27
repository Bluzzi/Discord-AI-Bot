import type { VoiceState, GuildBasedChannel } from "discord.js";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";
import { discord } from "#/discord";
import { logger } from "#/utils/logger";

discord.client.on("voiceStateUpdate", (_oldState: VoiceState, newState: VoiceState) => {
  // Check the voice channel if the most members connected:
  const channelToJoin: { channel: GuildBasedChannel | null; membersCount: number } = {
    channel: null,
    membersCount: 0,
  };

  for (const channel of newState.guild.channels.cache.values()) {
    if (!channel.isVoiceBased()) continue;

    const membersCount = channel.members.filter((member) => !member.user.bot).size;
    if (membersCount > channelToJoin.membersCount) {
      channelToJoin.channel = channel;
      channelToJoin.membersCount = membersCount;
    }
  }

  // Disconnect the bot if he is connected and there is no channel with more than 2 members:
  const voiceConnection = getVoiceConnection(newState.guild.id);
  if (voiceConnection && channelToJoin.membersCount < 2) {
    logger.info("No voice channel with at least 2 humans, leaving.");
    voiceConnection.destroy();
    return;
  }

  // If there is no channel with more than 2 members, do nothing:
  if (channelToJoin.membersCount < 2 || !channelToJoin.channel) {
    return;
  }

  // Join the most famous channel if the bot is not in:
  if (voiceConnection?.joinConfig.channelId !== channelToJoin.channel.id) {
    logger.info(`Joining voice channel: ${channelToJoin.channel.name} (${String(channelToJoin.membersCount)} members connected)`);

    joinVoiceChannel({
      channelId: channelToJoin.channel.id,
      guildId: newState.guild.id,
      adapterCreator: newState.guild.voiceAdapterCreator,
    });
  }
});

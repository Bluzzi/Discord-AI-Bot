import type { VoiceConnection } from "@discordjs/voice";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";
import { discord } from "#/discord";

let voiceConnection: VoiceConnection | null = null;

export const join = (channelId: string, guildId: string) => {
  const channel = discord.client.channels.cache.get(channelId);

  if (!channel?.isVoiceBased()) {
    throw new Error("Channel not found or not a voice channel");
  }

  if (voiceConnection) {
    voiceConnection.destroy();
  }

  voiceConnection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  return voiceConnection;
};

export const leave = () => {
  if (voiceConnection) {
    voiceConnection.destroy();
    voiceConnection = null;
  }

  for (const guild of discord.client.guilds.cache.values()) {
    const connection = getVoiceConnection(guild.id);
    if (connection) {
      connection.destroy();
    }
  }
};

export const getConnection = (): VoiceConnection | null => {
  return voiceConnection;
};

export const discordVoice = { join, leave, getConnection };

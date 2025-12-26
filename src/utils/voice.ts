    import { joinVoiceChannel, VoiceConnection, getVoiceConnection } from "@discordjs/voice";
import { botDiscord } from "./discord";

let currentVoiceConnection: VoiceConnection | null = null;

export function joinVoice(channelId: string, guildId: string) {
  const channel = botDiscord.channels.cache.get(channelId);
  
  if (!channel || !channel.isVoiceBased()) {
    throw new Error("Channel not found or not a voice channel");
  }

  if (currentVoiceConnection) {
    currentVoiceConnection.destroy();
  }

  currentVoiceConnection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  return currentVoiceConnection;
}

export function leaveVoice() {
  if (currentVoiceConnection) {
    currentVoiceConnection.destroy();
    currentVoiceConnection = null;
  }
  
  for (const guild of botDiscord.guilds.cache.values()) {
    const connection = getVoiceConnection(guild.id);
    if (connection) {
      connection.destroy();
    }
  }
}

export function getCurrentVoiceConnection(): VoiceConnection | null {
  return currentVoiceConnection;
}

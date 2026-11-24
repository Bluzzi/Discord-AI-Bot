import type { VoiceConnection } from "@discordjs/voice";
import { getVoiceConnection } from "@discordjs/voice";

export const fetchDiscordVoiceConnection = (guildId: string) => {
  const connection = getVoiceConnection(guildId);
  if (connection === undefined) {
    throw new Error("Bot is not connected to voice in this guild");
  }
  return connection;
};

export const getDiscordAudioPlayer = (connection: VoiceConnection) => "subscription" in connection.state ? connection.state.subscription?.player : undefined;

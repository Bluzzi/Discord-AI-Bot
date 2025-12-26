import type { VoiceState } from "discord.js";
import { logger } from "../utils/logger";
import { joinVoiceChannel, getVoiceConnection } from "@discordjs/voice";
import { discord } from "#/discord";

let aloneTimeout: NodeJS.Timeout | null = null;

function clearAloneTimeout() {
  if (aloneTimeout) {
    clearTimeout(aloneTimeout);
    aloneTimeout = null;
  }
}

function getMostPopulatedVoiceChannel(guildId: string) {
  const guild = discord.client.guilds.cache.get(guildId);
  if (!guild) return null;

  let maxMembers = 0;
  let targetChannel = null;

  for (const channel of guild.channels.cache.values()) {
    if (channel.isVoiceBased() && channel.members) {
      const humanMembers = channel.members.filter((member) => !member.user.bot);
      if (humanMembers.size > maxMembers) {
        maxMembers = humanMembers.size;
        targetChannel = channel;
      }
    }
  }

  return maxMembers >= 2 ? targetChannel : null;
}

function checkIfBotShouldLeave(guildId: string) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return;

  const guild = discord.client.guilds.cache.get(guildId);
  if (!guild) return;

  const botVoiceState = guild.members.me?.voice;
  if (!botVoiceState?.channel) return;

  const humanMembers = botVoiceState.channel.members.filter((member) => !member.user.bot);

  if (humanMembers.size < 2) {
    clearAloneTimeout();
    aloneTimeout = setTimeout(() => {
      logger.info(`Less than 2 users in voice channel, leaving...`);
      connection.destroy();
      aloneTimeout = null;
    }, 5000);
  }
  else {
    clearAloneTimeout();
  }
}

discord.client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
  try {
    if (newState.member?.user.bot) return;

    const guildId = newState.guild.id;
    const guild = discord.client.guilds.cache.get(guildId);
    if (!guild) return;

    const botMember = guild.members.me;
    if (!botMember) return;

    const mostPopulatedChannel = getMostPopulatedVoiceChannel(guildId);

    if (mostPopulatedChannel) {
      const currentBotChannel = botMember.voice.channel;

      if (!currentBotChannel || currentBotChannel.id !== mostPopulatedChannel.id) {
        logger.info(`Joining most populated voice channel: ${mostPopulatedChannel.name}`);

        joinVoiceChannel({
          channelId: mostPopulatedChannel.id,
          guildId: guildId,
          adapterCreator: guild.voiceAdapterCreator,
        });

        clearAloneTimeout();
      }
    }
    else {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        logger.info("Less than 2 users in voice channels, leaving...");
        connection.destroy();
        clearAloneTimeout();
      }
    }

    checkIfBotShouldLeave(guildId);
  }
  catch (error) {
    logger.error("Error in voice presence handler:", error instanceof Error ? error.stack : String(error));
  }
});

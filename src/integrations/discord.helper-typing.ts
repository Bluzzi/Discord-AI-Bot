import { discordClient } from "#/integrations/discord.client";
import { logger } from "#/utils/logger";

type ChannelTyping = { interval?: ReturnType<typeof setInterval>; count: number };
const typingByChannel = new Map<string, ChannelTyping>();

export const channelTypingManager = {
  add: (channelId: string): void => {
    // Reuse the active interval for this channel:
    const typing = typingByChannel.get(channelId);
    if (typing !== undefined && typing.count > 0) {
      typing.count += 1;
      return;
    }

    // Send typing immediately and refresh it while the interval is active:
    const activeTyping: ChannelTyping = { count: 1 };
    const sendTyping = async () => {
      try {
        const channel = await discordClient.channels.fetch(channelId);
        if (typingByChannel.get(channelId) !== activeTyping || channel?.isSendable() !== true) return;
        await channel.sendTyping();
      }
      catch {
        logger.warn(`[Discord channel ${channelId}] Could not send the typing indicator`);
      }
    };
    activeTyping.interval = setInterval(() => {
      void sendTyping();
    }, 8_000).unref();
    typingByChannel.set(channelId, activeTyping);
    void sendTyping();
  },
  sub: (channelId: string): void => {
    // Clear the interval when the last reply finishes:
    const typing = typingByChannel.get(channelId);
    if (typing === undefined || typing.count === 0) return;
    typing.count -= 1;
    if (typing.count > 0) return;
    clearInterval(typing.interval);
    typingByChannel.delete(channelId);
  },
};

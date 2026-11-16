import type { Message } from "discord.js";
import type { OmitPartialGroupDMChannel } from "discord.js";

const TYPING_REFRESH_INTERVAL_MS = 8000;

type TypingIndicatorChannel = OmitPartialGroupDMChannel<Message>["channel"];

// Low-level: start the typing indicator, run the work, and ALWAYS stop the indicator
// when the work completes or fails, before letting the error propagate:
export const withTypingIndicator = async <T>(channel: TypingIndicatorChannel, work: () => Promise<T>): Promise<T> => {
  await channel.sendTyping();

  const interval = setInterval(() => {
    void channel.sendTyping();
  }, TYPING_REFRESH_INTERVAL_MS);

  try {
    return await work();
  }
  finally {
    clearInterval(interval);
  }
};

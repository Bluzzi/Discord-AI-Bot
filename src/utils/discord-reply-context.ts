import { AsyncLocalStorage } from "node:async_hooks";

export const discordReplyContext = new AsyncLocalStorage<Readonly<{ guildId: string }>>();

export const getDiscordReplyGuildId = () => {
  const context = discordReplyContext.getStore();
  if (context === undefined) throw new Error("Missing Discord reply context");
  return context.guildId;
};

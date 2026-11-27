import type { GuildBasedChannel } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { utcNow } from "#/integrations/postgres.helper-timestamps";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { ensureDiscordGuild } from "#/tables/discord-guild.helper";
import { trigger } from "#/utils/trigger";
import { ChannelType } from "discord.js";
import { sql } from "drizzle-orm";

const saveChannelMetadata = async (channel: GuildBasedChannel) => {
  // Seed the guild if the channel event arrives before the startup inventory:
  const guildId = await ensureDiscordGuild(channel.guild);

  // A category has its own row; a thread does not have a direct category:
  const category = channel.type === ChannelType.GuildCategory ? channel : channel.isThread() ? null : channel.parent;
  const categoryRows = category === null ? [] : await postgres.insert(tableDiscordCategory)
    .values({ guildId, categoryId: category.id, categoryName: category.name })
    .onConflictDoUpdate({
      target: tableDiscordCategory.categoryId,
      set: {
        categoryName: category.name,
        updatedAt: sql`case when ${tableDiscordCategory.categoryName} is distinct from excluded.category_name then ${utcNow} else ${tableDiscordCategory.updatedAt} end`,
      },
    }).returning({ id: tableDiscordCategory.id });
  if (channel.type === ChannelType.GuildCategory) return;

  // Save channel metadata without touching the timestamp if nothing changed:
  const categoryId = categoryRows[0]?.id ?? null;
  const channelType = ChannelType[channel.type];
  await postgres.insert(tableDiscordChannel)
    .values({ guildId, categoryId, channelId: channel.id, channelName: channel.name, channelType })
    .onConflictDoUpdate({
      target: tableDiscordChannel.channelId,
      set: { categoryId, channelName: channel.name, channelType },
      setWhere: sql`(${tableDiscordChannel.categoryId}, ${tableDiscordChannel.channelName}, ${tableDiscordChannel.channelType})
        is distinct from (excluded.category_id, excluded.channel_name, excluded.channel_type)`,
    });
};

trigger.discordEvent({ eventName: "channelCreate", handler: saveChannelMetadata });
trigger.discordEvent({ eventName: "threadCreate", handler: saveChannelMetadata });

trigger.discordEvent({
  eventName: "channelUpdate",
  handler: async (oldChannel, channel) => {
    if (channel.isDMBased()) return;
    if ("guild" in oldChannel && oldChannel.name === channel.name && oldChannel.type === channel.type && oldChannel.parentId === channel.parentId) return;
    await saveChannelMetadata(channel);
  },
});

trigger.discordEvent({
  eventName: "threadUpdate",
  handler: async (oldThread, thread) => {
    if (oldThread.name !== thread.name || oldThread.type !== thread.type) await saveChannelMetadata(thread);
  },
});

trigger.discordEvent({
  eventName: "threadListSync",
  handler: async (threads) => {
    for (const thread of threads.values()) await saveChannelMetadata(thread);
  },
});

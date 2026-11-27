import type { Guild } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { utcNow } from "#/integrations/postgres.helper-timestamps";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { trigger } from "#/utils/trigger";
import { ChannelType } from "discord.js";
import { sql } from "drizzle-orm";

const syncingGuilds = new Set<string>();

const syncGuildInventory = async (guild: Guild) => {
  // Take one inventory per guild, even if startup and availability events overlap:
  if (!guild.available || syncingGuilds.has(guild.id)) return;
  syncingGuilds.add(guild.id);

  await (async () => {
    const [guildRow] = await postgres.insert(tableDiscordGuild).values({ guildId: guild.id, guildName: guild.name })
      .onConflictDoUpdate({
        target: tableDiscordGuild.guildId,
        set: {
          guildName: guild.name,
          updatedAt: sql`case when ${tableDiscordGuild.guildName} is distinct from excluded.guild_name then ${utcNow} else ${tableDiscordGuild.updatedAt} end`,
        },
      }).returning({ id: tableDiscordGuild.id });
    const guildId = guildRow!.id;

    // Save categories before their channels:
    const categories = [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildCategory);
    const categoryRows = categories.length === 0 ? [] : await postgres.insert(tableDiscordCategory).values(categories.map((category) => ({
      guildId,
      categoryId: category.id,
      categoryName: category.name,
    }))).onConflictDoUpdate({
      target: tableDiscordCategory.categoryId,
      set: {
        categoryName: sql`excluded.category_name`,
        updatedAt: sql`case when ${tableDiscordCategory.categoryName} is distinct from excluded.category_name then ${utcNow} else ${tableDiscordCategory.updatedAt} end`,
      },
    }).returning({ id: tableDiscordCategory.id, categoryId: tableDiscordCategory.categoryId });
    const categoryIds = new Map(categoryRows.map((category) => [category.categoryId, category.id]));

    // Persist cached channels and threads in batches:
    const channels = [...guild.channels.cache.values()].filter((channel) => channel.type !== ChannelType.GuildCategory);
    for (let index = 0; index < channels.length; index += 500) {
      await postgres.insert(tableDiscordChannel).values(channels.slice(index, index + 500).map((channel) => ({
        guildId,
        categoryId: channel.isThread() || channel.parentId === null ? null : categoryIds.get(channel.parentId) ?? null,
        channelId: channel.id,
        channelName: channel.name,
        channelType: ChannelType[channel.type],
      }))).onConflictDoUpdate({
        target: tableDiscordChannel.channelId,
        set: {
          categoryId: sql`excluded.category_id`,
          channelName: sql`excluded.channel_name`,
          channelType: sql`excluded.channel_type`,
        },
        setWhere: sql`(${tableDiscordChannel.categoryId}, ${tableDiscordChannel.channelName}, ${tableDiscordChannel.channelType})
          is distinct from (excluded.category_id, excluded.channel_name, excluded.channel_type)`,
      });
    }

    // Fetch the full member list, including members not already cached:
    const members = [...(await guild.members.fetch()).values()];
    for (let index = 0; index < members.length; index += 500) {
      await postgres.insert(tableDiscordMember).values(members.slice(index, index + 500).map((member): typeof tableDiscordMember.$inferInsert => ({
        guildId,
        userId: member.id,
        memberName: member.nickname,
        userName: member.user.globalName,
        userTag: member.user.username,
        userProfilePicture: member.user.avatarURL(),
        memberType: member.user.bot ? "bot" : "human",
      }))).onConflictDoUpdate({
        target: [tableDiscordMember.guildId, tableDiscordMember.userId],
        set: {
          memberName: sql`excluded.member_name`,
          userName: sql`excluded.user_name`,
          userTag: sql`excluded.user_tag`,
          userProfilePicture: sql`excluded.user_profile_picture`,
          memberType: sql`excluded.member_type`,
        },
        setWhere: sql`(${tableDiscordMember.memberName}, ${tableDiscordMember.userName}, ${tableDiscordMember.userTag}, ${tableDiscordMember.userProfilePicture}, ${tableDiscordMember.memberType})
          is distinct from (excluded.member_name, excluded.user_name, excluded.user_tag, excluded.user_profile_picture, excluded.member_type)`,
      });
    }
  })().finally(() => {
    syncingGuilds.delete(guild.id);
  });
};

trigger.discordEvent({
  eventName: "clientReady",
  handler: async (client) => {
    await Promise.all([...client.guilds.cache.values()].map(syncGuildInventory));
  },
});

trigger.discordEvent({ eventName: "guildCreate", handler: syncGuildInventory });
trigger.discordEvent({
  eventName: "guildAvailable",
  handler: async (guild) => {
    if (guild.client.isReady()) await syncGuildInventory(guild);
  },
});

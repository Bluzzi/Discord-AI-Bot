import type { GuildBasedChannel, GuildMember } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { ensureDiscordGuild } from "#/tables/discord-guild.helper";
import { getDiscordMemberMetadata } from "#/tables/discord-member.helper";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { ChannelType } from "discord.js";
import { sql } from "drizzle-orm";

export const ensureDiscordChannelAndMember = async (channel: GuildBasedChannel, member: GuildMember) => {
  // Seed parent rows before inserting their dependents:
  const guildId = await ensureDiscordGuild(channel.guild);
  const category = channel.isThread() ? null : channel.parent;
  const categoryRows = category === null ? [] : await postgres.insert(tableDiscordCategory)
    .values({ guildId, categoryId: category.id, categoryName: category.name })
    .onConflictDoUpdate({
      target: tableDiscordCategory.categoryId,
      set: { updatedAt: sql`${tableDiscordCategory.updatedAt}` },
    }).returning({ id: tableDiscordCategory.id });

  // Resolve both references while keeping metadata owned by the Discord events:
  const [[channelRow], [memberRow]] = await Promise.all([
    postgres.insert(tableDiscordChannel).values({
      guildId,
      categoryId: categoryRows[0]?.id ?? null,
      channelId: channel.id,
      channelName: channel.name,
      channelType: ChannelType[channel.type],
    }).onConflictDoUpdate({
      target: tableDiscordChannel.channelId,
      set: { updatedAt: sql`${tableDiscordChannel.updatedAt}` },
    }).returning({ id: tableDiscordChannel.id }),
    postgres.insert(tableDiscordMember).values({
      guildId,
      userId: member.id,
      ...getDiscordMemberMetadata(member),
    }).onConflictDoUpdate({
      target: [tableDiscordMember.guildId, tableDiscordMember.userId],
      set: { updatedAt: sql`${tableDiscordMember.updatedAt}` },
    }).returning({ id: tableDiscordMember.id }),
  ]);

  return { guildId, channelId: channelRow!.id, memberId: memberRow!.id };
};

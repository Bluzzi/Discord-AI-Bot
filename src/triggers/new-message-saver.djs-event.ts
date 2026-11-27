import { postgres } from "#/integrations/postgres.client";
import { tableDiscordCategory } from "#/tables/discord-category.table";
import { tableDiscordChannel } from "#/tables/discord-channel.table";
import { tableDiscordGuild } from "#/tables/discord-guild.table";
import { tableDiscordMember } from "#/tables/discord-member.table";
import { tableDiscordMessage } from "#/tables/discord-message.table";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { ChannelType } from "discord.js";
import { sql } from "drizzle-orm";

trigger.discordEvent({
  eventName: "messageCreate",
  handler: async (message) => {
    // Save messages from server members and bots, not webhooks or system messages:
    if (!message.inGuild() || message.webhookId !== null || message.system) return;
    const { author, channel, content, createdAt, editedAt, guild, id } = message;
    // Ensure the references exist even if the initial guild sync is still running:
    const member = message.member ?? await guild.members.fetch(author.id);
    const [guildRow] = await postgres.insert(tableDiscordGuild)
      .values({ guildId: guild.id, guildName: guild.name })
      .onConflictDoUpdate({
        target: tableDiscordGuild.guildId,
        set: { updatedAt: sql`${tableDiscordGuild.updatedAt}` },
      }).returning({ id: tableDiscordGuild.id });
    const guildId = guildRow!.id;

    const category = channel.isThread() ? null : channel.parent;
    const categoryRows = category === null ? [] : await postgres.insert(tableDiscordCategory)
      .values({ guildId, categoryId: category.id, categoryName: category.name })
      .onConflictDoUpdate({
        target: tableDiscordCategory.categoryId,
        set: { updatedAt: sql`${tableDiscordCategory.updatedAt}` },
      }).returning({ id: tableDiscordCategory.id });
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
        memberName: member.nickname,
        userName: member.user.globalName,
        userTag: member.user.username,
        userProfilePicture: member.user.avatarURL(),
        memberType: member.user.bot ? "bot" : "human",
      }).onConflictDoUpdate({
        target: [tableDiscordMember.guildId, tableDiscordMember.userId],
        set: { updatedAt: sql`${tableDiscordMember.updatedAt}` },
      }).returning({ id: tableDiscordMember.id }),
    ]);

    // Save the original Discord timestamps and ignore duplicate creation events:
    await postgres.insert(tableDiscordMessage).values({
      guildId,
      channelId: channelRow!.id,
      memberId: memberRow!.id,
      messageId: id,
      messageContent: content,
      attachmentUrls: message.attachments.map((attachment) => attachment.url),
      createdAt,
      updatedAt: editedAt,
    }).onConflictDoNothing({ target: tableDiscordMessage.messageId });
  },
  onError: (_error, message) => {
    logger.error(`Could not save Discord message ${message.id}`);
  },
});

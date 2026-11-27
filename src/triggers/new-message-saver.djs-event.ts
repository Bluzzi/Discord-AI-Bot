import { postgres } from "#/integrations/postgres.client";
import { ensureDiscordChannelAndMember } from "#/tables/discord-channel.helper";
import { tableDiscordMessage } from "#/tables/discord-message.table";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";

trigger.discordEvent({
  eventName: "messageCreate",
  handler: async (message) => {
    // Save messages from server members and bots, not webhooks or system messages:
    if (!message.inGuild() || message.webhookId !== null || message.system) return;
    const { author, channel, content, createdAt, editedAt, guild, id } = message;
    // Ensure the references exist even if the initial guild sync is still running:
    const member = message.member ?? await guild.members.fetch(author.id);
    const { guildId, channelId: storedChannelId, memberId } = await ensureDiscordChannelAndMember(channel, member);

    // Save the original Discord timestamps and ignore duplicate creation events:
    await postgres.insert(tableDiscordMessage).values({
      guildId,
      channelId: storedChannelId,
      memberId,
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

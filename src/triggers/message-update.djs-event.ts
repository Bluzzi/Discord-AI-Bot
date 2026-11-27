import type { Message, PartialMessage } from "discord.js";
import { postgres } from "#/integrations/postgres.client";
import { tableDiscordMessage } from "#/tables/discord-message";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import { and, eq, isNull, lt, or } from "drizzle-orm";

trigger.discordEvent({
  eventName: "messageUpdate",
  handler: async (oldMessage, message: Message | PartialMessage) => {
    // Ignore updates unrelated to an edit, such as Discord expanding a link preview:
    if (message.guildId === null || message.editedAt === null || oldMessage.editedTimestamp === message.editedTimestamp) return;
    const { content, editedAt, id } = message;
    // Fetch missing content only if we already store the message:
    let messageContent = content;
    let updatedAt: Date | null = editedAt;
    if (messageContent === null) {
      const [stored] = await postgres.select({ id: tableDiscordMessage.id }).from(tableDiscordMessage)
        .where(eq(tableDiscordMessage.messageId, id));
      if (stored === undefined) return;
      const fetched = await message.fetch();
      messageContent = fetched.content;
      updatedAt = fetched.editedAt;
    }

    // Ignore an older edit that was replayed or superseded by a fetch:
    if (updatedAt === null) return;
    await postgres.update(tableDiscordMessage).set({ messageContent, updatedAt }).where(and(
      eq(tableDiscordMessage.messageId, id),
      or(isNull(tableDiscordMessage.updatedAt), lt(tableDiscordMessage.updatedAt, updatedAt)),
    ));
  },
  onError: (_error, message) => {
    logger.error(`Could not update Discord message ${message.id}`);
  },
});

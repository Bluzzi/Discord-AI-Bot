import { columns } from "#/utils/postgres-timestamps";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const tableDiscordReplyError = pgTable("discord_reply_error", {
  id: uuid("id").primaryKey(),
  messageId: text("message_id").notNull(),
  messageContent: text("message_content").notNull(),
  errorContent: text("error_content").notNull(),
  createdAt: columns.createdAt,
});

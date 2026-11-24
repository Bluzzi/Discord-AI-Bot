import { columns } from "#/integrations/postgres-timestamps.helper";
import { pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const messageFeedbackReactionEnum = pgEnum("message_feedback_reaction", [
  "upvote",
  "downvote",
]);

export const tableMessageFeedback = pgTable("message_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageContent: text("message_content").notNull(),
  previousMessages: text("previous_messages").notNull(),
  reaction: messageFeedbackReactionEnum("reaction").notNull(),

  createdAt: columns.createdAt,
});

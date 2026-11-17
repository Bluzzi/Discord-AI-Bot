import { columns } from "./column";
import { integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const tableDiscordUserMemory = pgTable("discord_user_memory", {
  userID: text("user_id").primaryKey(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const tableDiscordSkill = pgTable("discord_skill", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull(),
  rule: text("rule").notNull(),
  createdByUserID: text("created_by_user_id").notNull(),
  usageCount: integer("usage_count").notNull().default(0),

  createdAt: columns.createdAt,
});

export const aiCauseEnum = pgEnum("ai_cause", [
  "reply_to_message",
  "reply_decision",
  "discord_presence",
  "consolidate_user_memory",
]);

export const tableModelUsage = pgTable("model_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  cause: aiCauseEnum("cause").notNull(),
  inputTokenCount: integer("input_token_count").notNull(),
  outputTokenCount: integer("output_token_count").notNull(),
  inputPrice: numeric("input_price", { precision: 12, scale: 10, mode: "number" }),
  outputPrice: numeric("output_price", { precision: 12, scale: 10, mode: "number" }),
  modelUsed: text("model_used").notNull(),

  createdAt: columns.createdAt,
});

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

import { columns } from "./column";
import { integer, numeric, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

export const tableDiscordUserMemory = pgTable("discord_user_memory", {
  userID: text("user_id").primaryKey(),
  memoryText: text("memory_text").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const aiCauseEnum = pgEnum("ai_cause", [
  "reply_to_message",
  "reply_decision",
  "discord_presence",
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

export const featureRequestStatusEnum = pgEnum("feature_request_status", [
  "open",
  "closed",
]);

export const tableFeatureRequest = pgTable("feature_request", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  description: text("description"),
  status: featureRequestStatusEnum("status").notNull().default("open"),
  authorUserID: text("author_user_id").notNull(),

  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

export const tableFeatureRequestUpvote = pgTable("feature_request_upvote", {
  featureRequestID: integer("feature_request_id")
    .notNull()
    .references(() => tableFeatureRequest.id, { onDelete: "cascade" }),
  userID: text("user_id").notNull(),

  createdAt: columns.createdAt,
}, (table) => [
  unique("feature_request_upvote_unique").on(table.featureRequestID, table.userID),
]);

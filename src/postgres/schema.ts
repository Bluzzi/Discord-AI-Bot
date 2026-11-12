import { columns } from "./column";
import { integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

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

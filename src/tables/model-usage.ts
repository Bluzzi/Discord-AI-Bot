import { columns } from "#/integrations/postgres-timestamps.helper";
import { integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const aiCauseEnum = pgEnum("ai_cause", [
  "reply_to_message",
  "reply_decision",
  "discord_presence",
  "consolidate_user_memory",
  "clean_up_skills",
]);

export const tableModelUsage = pgTable("model_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  cause: aiCauseEnum("cause").notNull(),
  stepCount: integer("step_count"),
  inputTokenCount: integer("input_token_count").notNull(),
  outputTokenCount: integer("output_token_count").notNull(),
  inputPrice: numeric("input_price", { precision: 12, scale: 10, mode: "number" }),
  outputPrice: numeric("output_price", { precision: 12, scale: 10, mode: "number" }),
  modelUsed: text("model_used").notNull(),

  createdAt: columns.createdAt,
});

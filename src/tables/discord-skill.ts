import { columns } from "#/integrations/postgres.helper-timestamps";
import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const tableDiscordSkill = pgTable("discord_skill", {
  id: uuid("id").primaryKey().defaultRandom(),
  trigger: text("trigger").notNull(),
  rule: text("rule").notNull(),
  createdByUserID: text("created_by_user_id").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  deletedAt: columns.deletedAt,

  createdAt: columns.createdAt,
});

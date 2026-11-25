import { columns } from "#/integrations/postgres.helper-timestamps";
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const railwaySandboxTypeEnum = pgEnum("railway_sandbox_type", ["PRIVATE", "ISOLATED"]);

export const tableRailwaySandbox = pgTable("railway_sandbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  sandboxId: text("sandbox_id").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isDestroy: boolean("is_destroy").notNull().default(false),
  previewUrl: text("preview_url"),
  type: railwaySandboxTypeEnum("type").notNull(),
  createdAt: columns.createdAt,
});

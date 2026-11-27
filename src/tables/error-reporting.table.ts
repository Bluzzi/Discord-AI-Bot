import { columns } from "#/integrations/postgres.helper-timestamps";
import { pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const errorReportingStatus = pgEnum("error_reporting_status", ["open", "close"]);

export const tableErrorReporting = pgTable("error_reporting", {
  id: uuid("id").primaryKey().defaultRandom(),
  message: text("message").notNull().unique(),
  status: errorReportingStatus("status").notNull().default("open").$onUpdate(() => "open"),
  createdAt: columns.createdAt,
  updatedAt: columns.updatedAt,
});

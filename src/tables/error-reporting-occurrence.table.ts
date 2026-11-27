import { columns } from "#/integrations/postgres.helper-timestamps";
import { tableErrorReporting } from "#/tables/error-reporting.table";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const tableErrorReportingOccurrence = pgTable("error_reporting_occurrence", {
  id: uuid("id").primaryKey().defaultRandom(),
  errorId: uuid("error_id").notNull().references(() => tableErrorReporting.id, { onDelete: "cascade" }),
  messageInspect: text("message_inspect").notNull(),
  createdAt: columns.createdAt,
}, (table) => [
  index("error_reporting_occurrence_error_id_idx").on(table.errorId),
]);

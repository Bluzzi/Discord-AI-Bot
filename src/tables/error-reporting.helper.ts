import { postgres } from "#/integrations/postgres.client";
import { utcNow } from "#/integrations/postgres.helper-timestamps";
import { tableErrorReportingOccurrence } from "#/tables/error-reporting-occurrence.table";
import { tableErrorReporting } from "#/tables/error-reporting.table";
import { logger } from "#/utils/logger";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";

export const reportError = async (error: unknown, label: string) => {
  // Use the underlying error message when the reply stream wraps an error:
  const cause = error instanceof Error ? error.cause : undefined;
  const reportedError: unknown = cause instanceof Error || typeof cause === "string" ? cause : error;
  const message = reportedError instanceof Error ? reportedError.message || reportedError.name : (
    typeof reportedError === "string" && reportedError ? reportedError : "Unknown error"
  );

  // Update the error group and save the occurrence atomically:
  const id = randomUUID();
  try {
    await postgres.transaction(async (transaction) => {
      const [report] = await transaction.insert(tableErrorReporting).values({ message })
        .onConflictDoUpdate({
          target: tableErrorReporting.message,
          set: { updatedAt: utcNow },
        }).returning({ id: tableErrorReporting.id });
      if (!report) throw new Error("Could not resolve error report");

      await transaction.insert(tableErrorReportingOccurrence).values({
        id,
        errorId: report.id,
        messageInspect: inspect(error, { depth: null, customInspect: false }),
      });
    });
  }
  catch {
    logger.error(`${label} (could not save error ${id})`);
    return;
  }

  logger.error(`${label} (error occurrence ID ${id})`);
};

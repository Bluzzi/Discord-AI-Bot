ALTER TABLE "waiting_approval" RENAME TO "tool_waiting_approval";--> statement-breakpoint
ALTER TABLE "tool_waiting_approval" RENAME CONSTRAINT "waiting_approval_validating_message_id_unique" TO "tool_waiting_approval_validating_message_id_unique";

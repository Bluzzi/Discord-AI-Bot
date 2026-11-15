ALTER TABLE "message_feedback" DROP COLUMN "author_type";--> statement-breakpoint
ALTER TABLE "message_feedback" DROP COLUMN "author_id";--> statement-breakpoint
DROP TYPE "public"."message_feedback_author_type";
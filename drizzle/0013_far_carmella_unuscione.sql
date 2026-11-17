ALTER TYPE "public"."ai_cause" ADD VALUE 'clean_up_skills';--> statement-breakpoint
ALTER TABLE "discord_skill" ADD COLUMN "deleted_at" timestamp with time zone;
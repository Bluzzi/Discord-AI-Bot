ALTER TABLE "discord_reply_error" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_reply_error" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "model_usage" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "model_usage" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');

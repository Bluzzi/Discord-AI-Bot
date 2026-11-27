ALTER TABLE "discord_category" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_category" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_category" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING ("updated_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_category" ALTER COLUMN "updated_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_channel" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_channel" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_channel" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING ("updated_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_channel" ALTER COLUMN "updated_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_guild" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_guild" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_guild" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING ("updated_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_guild" ALTER COLUMN "updated_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_member" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_member" ALTER COLUMN "created_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_member" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING ("updated_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_member" ALTER COLUMN "updated_at" SET DEFAULT (now() at time zone 'UTC');--> statement-breakpoint
ALTER TABLE "discord_message" ALTER COLUMN "created_at" SET DATA TYPE timestamp USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_message" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING ("updated_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_voice_minute" ALTER COLUMN "created_at" SET DATA TYPE timestamp (0) USING ("created_at" AT TIME ZONE 'UTC');--> statement-breakpoint
ALTER TABLE "discord_voice_minute" ALTER COLUMN "created_at" SET DEFAULT date_trunc('second', statement_timestamp() at time zone 'UTC');

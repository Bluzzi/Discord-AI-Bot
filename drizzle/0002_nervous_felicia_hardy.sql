CREATE TABLE "discord_guild_law" (
	"law_code" text PRIMARY KEY NOT NULL,
	"law_text" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_channel_memory" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_guild_memory" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_user_memory" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_channel_memory" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "discord_guild_memory" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "discord_user_memory" DROP COLUMN "updated_at";
ALTER TABLE "discord_channel_memory" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discord_guild_law" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discord_guild_memory" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "discord_channel_memory" CASCADE;--> statement-breakpoint
DROP TABLE "discord_guild_law" CASCADE;--> statement-breakpoint
DROP TABLE "discord_guild_memory" CASCADE;--> statement-breakpoint
TRUNCATE "discord_user_memory";--> statement-breakpoint
ALTER TABLE "discord_user_memory" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "discord_user_memory" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_user_memory" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "discord_user_memory" DROP COLUMN "deleted_at";
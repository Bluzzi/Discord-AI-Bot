CREATE TYPE "public"."discord_member_type" AS ENUM('human', 'bot');--> statement-breakpoint
CREATE TABLE "discord_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"category_id" text NOT NULL,
	"category_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_category_category_id_unique" UNIQUE("category_id"),
	CONSTRAINT "discord_category_id_guild_id_unique" UNIQUE("id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"category_id" uuid,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_channel_channel_id_unique" UNIQUE("channel_id"),
	CONSTRAINT "discord_channel_id_guild_id_unique" UNIQUE("id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_guild" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_guild_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"member_name" text,
	"user_name" text,
	"user_tag" text NOT NULL,
	"user_profile_picture" text,
	"member_type" "discord_member_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_member_id_guild_id_unique" UNIQUE("id","guild_id"),
	CONSTRAINT "discord_member_guild_id_user_id_unique" UNIQUE("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "discord_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"message_content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "discord_message_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "discord_voice_minute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp (0) with time zone DEFAULT date_trunc('second', statement_timestamp()) NOT NULL,
	CONSTRAINT "discord_voice_minute_member_id_created_at_unique" UNIQUE("member_id","created_at")
);
--> statement-breakpoint
ALTER TABLE "discord_category" ADD CONSTRAINT "discord_category_guild_id_discord_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guild"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel" ADD CONSTRAINT "discord_channel_guild_id_discord_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guild"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channel" ADD CONSTRAINT "discord_channel_category_fk" FOREIGN KEY ("category_id","guild_id") REFERENCES "public"."discord_category"("id","guild_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_member" ADD CONSTRAINT "discord_member_guild_id_discord_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guild"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_message" ADD CONSTRAINT "discord_message_guild_id_discord_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guild"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_message" ADD CONSTRAINT "discord_message_channel_fk" FOREIGN KEY ("channel_id","guild_id") REFERENCES "public"."discord_channel"("id","guild_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_message" ADD CONSTRAINT "discord_message_member_fk" FOREIGN KEY ("member_id","guild_id") REFERENCES "public"."discord_member"("id","guild_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_voice_minute" ADD CONSTRAINT "discord_voice_minute_guild_id_discord_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guild"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_voice_minute" ADD CONSTRAINT "discord_voice_minute_channel_fk" FOREIGN KEY ("channel_id","guild_id") REFERENCES "public"."discord_channel"("id","guild_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_voice_minute" ADD CONSTRAINT "discord_voice_minute_member_fk" FOREIGN KEY ("member_id","guild_id") REFERENCES "public"."discord_member"("id","guild_id") ON DELETE no action ON UPDATE no action;

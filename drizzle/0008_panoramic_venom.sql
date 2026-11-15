CREATE TYPE "public"."message_feedback_author_type" AS ENUM('bot', 'discord_user');--> statement-breakpoint
CREATE TYPE "public"."message_feedback_reaction" AS ENUM('upvote', 'downvote');--> statement-breakpoint
CREATE TABLE "message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_type" "message_feedback_author_type" NOT NULL,
	"author_id" text NOT NULL,
	"message_content" text NOT NULL,
	"previous_messages" text NOT NULL,
	"reaction" "message_feedback_reaction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "discord_reply_error" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"message_content" text NOT NULL,
	"error_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TYPE "public"."ai_cause" AS ENUM('reply_to_message', 'reply_decision', 'discord_presence');--> statement-breakpoint
CREATE TABLE "model_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cause" "ai_cause" NOT NULL,
	"input_token_count" integer NOT NULL,
	"output_token_count" integer NOT NULL,
	"input_price" numeric(12, 10),
	"output_price" numeric(12, 10),
	"model_used" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

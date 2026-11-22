CREATE TABLE "waiting_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_member" text NOT NULL,
	"validating_message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"actions" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "waiting_approval_validating_message_id_unique" UNIQUE("validating_message_id")
);

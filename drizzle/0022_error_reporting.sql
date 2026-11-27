CREATE TABLE "error_reporting_occurrence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_id" uuid NOT NULL,
	"message_inspect" text NOT NULL,
	"created_at" timestamp DEFAULT (now() at time zone 'UTC') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_reporting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT (now() at time zone 'UTC') NOT NULL,
	"updated_at" timestamp DEFAULT (now() at time zone 'UTC') NOT NULL,
	CONSTRAINT "error_reporting_message_unique" UNIQUE("message")
);
--> statement-breakpoint
ALTER TABLE "error_reporting_occurrence" ADD CONSTRAINT "error_reporting_occurrence_error_id_error_reporting_id_fk" FOREIGN KEY ("error_id") REFERENCES "public"."error_reporting"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_reporting_occurrence_error_id_idx" ON "error_reporting_occurrence" USING btree ("error_id");
--> statement-breakpoint
DROP TABLE "discord_reply_error";

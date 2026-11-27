CREATE TYPE "public"."error_reporting_status" AS ENUM('open', 'close');--> statement-breakpoint
ALTER TABLE "error_reporting" ADD COLUMN "status" "error_reporting_status" DEFAULT 'open' NOT NULL;
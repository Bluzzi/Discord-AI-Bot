CREATE TYPE "public"."railway_sandbox_type" AS ENUM('PRIVATE', 'ISOLATED');--> statement-breakpoint
CREATE TABLE "railway_sandbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandbox_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"is_destroy" boolean DEFAULT false NOT NULL,
	"preview_url" text,
	"type" "railway_sandbox_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "railway_sandbox_sandbox_id_unique" UNIQUE("sandbox_id")
);

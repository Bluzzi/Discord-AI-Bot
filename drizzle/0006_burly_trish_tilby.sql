CREATE TYPE "public"."feature_request_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "feature_request" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feature_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"status" "feature_request_status" DEFAULT 'open' NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_request_upvote" (
	"feature_request_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_request_upvote_unique" UNIQUE("feature_request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "feature_request_upvote" ADD CONSTRAINT "feature_request_upvote_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;
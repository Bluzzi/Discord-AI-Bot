ALTER TABLE "error_reporting_occurrence" DROP CONSTRAINT "error_reporting_occurrence_error_id_error_reporting_id_fk";
--> statement-breakpoint
ALTER TABLE "error_reporting_occurrence" ADD CONSTRAINT "error_reporting_occurrence_error_id_error_reporting_id_fk" FOREIGN KEY ("error_id") REFERENCES "public"."error_reporting"("id") ON DELETE cascade ON UPDATE no action;
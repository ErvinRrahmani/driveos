CREATE TABLE "rm_lead_students" (
	"school_id" uuid NOT NULL,
	"student_id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"converted_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_reports" ADD COLUMN "leads_captured" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_reports" ADD COLUMN "leads_converted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_reports" ADD COLUMN "lead_revenue_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ADD COLUMN "leads_captured" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ADD COLUMN "leads_converted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ADD COLUMN "lead_revenue_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_lead_students" ADD CONSTRAINT "rm_lead_students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;
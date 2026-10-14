CREATE TABLE "rm_instructor_availability" (
	"school_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"windows" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rm_instructor_availability_pkey" PRIMARY KEY("school_id","instructor_membership_id","version")
);
--> statement-breakpoint
CREATE TABLE "rm_instructor_time_off" (
	"school_id" uuid NOT NULL,
	"time_off_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rm_instructor_time_off_pkey" PRIMARY KEY("school_id","time_off_id")
);
--> statement-breakpoint
CREATE TABLE "rm_metric_sources" (
	"school_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"day" date NOT NULL,
	"counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rm_metric_sources_pkey" PRIMARY KEY("school_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "rm_test_attempts_daily" (
	"school_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"attempts" integer NOT NULL,
	"passed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rm_test_attempts_daily_pkey" PRIMARY KEY("school_id","day","kind")
);
--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ADD COLUMN "lessons_due" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_instructor_availability" ADD CONSTRAINT "rm_instructor_availability_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_instructor_time_off" ADD CONSTRAINT "rm_instructor_time_off_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_metric_sources" ADD CONSTRAINT "rm_metric_sources_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_test_attempts_daily" ADD CONSTRAINT "rm_test_attempts_daily_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rm_instructor_time_off_start_idx" ON "rm_instructor_time_off" USING btree ("school_id","start_at");--> statement-breakpoint
ALTER TABLE "rm_test_attempts_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_test_attempts_daily" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_test_attempts_daily_tenant" ON "rm_test_attempts_daily" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "rm_metric_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_metric_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_metric_sources_tenant" ON "rm_metric_sources" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "rm_instructor_availability" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_instructor_availability" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_instructor_availability_tenant" ON "rm_instructor_availability" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "rm_instructor_time_off" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_instructor_time_off" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_instructor_time_off_tenant" ON "rm_instructor_time_off" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);

CREATE TABLE "availability_versions" (
	"school_id" uuid NOT NULL,
	"instructor_membership_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_types" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "time_off" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_versions" ADD CONSTRAINT "availability_versions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_versions" ADD CONSTRAINT "availability_versions_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_instructor_idx" ON "availability" USING btree ("instructor_membership_id","valid_from");--> statement-breakpoint
CREATE INDEX "lessons_period_idx" ON "lessons" USING gist ("period");--> statement-breakpoint
CREATE INDEX "lessons_student_idx" ON "lessons" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "lessons_vehicle_idx" ON "lessons" USING btree ("school_id","vehicle_id");--> statement-breakpoint
ALTER TABLE "availability_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "availability_versions_tenant" ON "availability_versions" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist ("instructor_membership_id" WITH =, "period" WITH &&);

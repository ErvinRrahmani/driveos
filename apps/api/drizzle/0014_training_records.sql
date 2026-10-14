CREATE TABLE "rm_student_lessons" (
	"school_id" uuid NOT NULL,
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_entries" ADD COLUMN "recorded_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rm_student_lessons" ADD CONSTRAINT "rm_student_lessons_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_student_lessons" ADD CONSTRAINT "rm_student_lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rm_student_lessons_student_idx" ON "rm_student_lessons" USING btree ("student_id","start_at");--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_recorded_by_membership_id_memberships_id_fk" FOREIGN KEY ("recorded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "private_notes_lesson_author_key" ON "private_notes" USING btree ("lesson_id","student_id","author_membership_id");--> statement-breakpoint
CREATE INDEX "private_notes_student_idx" ON "private_notes" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_entries_lesson_item_key" ON "progress_entries" USING btree ("lesson_id","student_id","syllabus_item_id");--> statement-breakpoint
CREATE INDEX "progress_entries_student_idx" ON "progress_entries" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "test_attempts_student_idx" ON "test_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "test_attempts_taken_on_idx" ON "test_attempts" USING btree ("school_id","taken_on");--> statement-breakpoint
ALTER TABLE "rm_student_lessons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_student_lessons" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_student_lessons_tenant" ON "rm_student_lessons" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);

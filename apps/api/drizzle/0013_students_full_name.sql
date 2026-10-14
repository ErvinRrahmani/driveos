ALTER TABLE "guardian_links" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "full_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "enrolments_student_idx" ON "enrolments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_links_active_key" ON "guardian_links" USING btree ("student_id","guardian_user_id") WHERE "guardian_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "guardian_links_guardian_idx" ON "guardian_links" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_instructors_active_key" ON "student_instructors" USING btree ("student_id","instructor_membership_id") WHERE "student_instructors"."unassigned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "student_instructors_primary_key" ON "student_instructors" USING btree ("student_id") WHERE "student_instructors"."is_primary" and "student_instructors"."unassigned_at" is null;--> statement-breakpoint
CREATE INDEX "student_instructors_instructor_idx" ON "student_instructors" USING btree ("instructor_membership_id") WHERE "student_instructors"."unassigned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_user_key" ON "students" USING btree ("school_id","user_id") WHERE "students"."user_id" is not null;
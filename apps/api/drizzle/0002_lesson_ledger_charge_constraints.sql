ALTER TABLE "lessons" ADD CONSTRAINT "lessons_instructor_no_overlap"
  EXCLUDE USING gist ("instructor_membership_id" WITH =, "period" WITH &&)
  WHERE ("status" IN ('booked', 'completed'));
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_vehicle_no_overlap"
  EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&)
  WHERE ("status" IN ('booked', 'completed') AND "vehicle_id" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_no_overlap"
  EXCLUDE USING gist ("student_id" WITH =, "period" WITH &&)
  WHERE ("status" IN ('booked', 'completed'));
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_minutes_sign_check"
  CHECK (("entry_type" IN ('purchase', 'restore') AND "minutes" > 0)
      OR ("entry_type" IN ('debit', 'refund') AND "minutes" < 0)
      OR ("entry_type" = 'adjustment' AND "minutes" <> 0));
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_charges_student_fee_key"
  ON "platform_charges" ("school_id", "student_id")
  WHERE "kind" = 'student_fee';

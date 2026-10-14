CREATE UNIQUE INDEX "platform_charges_student_fee_reversal_key"
  ON "platform_charges" ("school_id", "student_id")
  WHERE "kind" = 'student_fee_reversal';
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_statements_school_month_key"
  ON "platform_statements" ("school_id", "month");

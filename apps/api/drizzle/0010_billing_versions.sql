ALTER TABLE "entitlements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "entitlements_student_id_idx" ON "entitlements" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "entitlements_consumed_by_lesson_id_idx" ON "entitlements" USING btree ("consumed_by_lesson_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_student_id_id_idx" ON "ledger_entries" USING btree ("student_id","id");
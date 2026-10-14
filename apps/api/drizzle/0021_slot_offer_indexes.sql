CREATE INDEX "slot_offers_open_expiry_idx" ON "slot_offers" USING btree ("school_id","expires_at") WHERE "slot_offers"."status" = 'open';--> statement-breakpoint
CREATE INDEX "slot_offers_offered_to_idx" ON "slot_offers" USING gin ("offered_to_student_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_list_active_student_type_key" ON "waiting_list" USING btree ("school_id","student_id","lesson_type_id") WHERE "waiting_list"."active";--> statement-breakpoint
CREATE INDEX "waiting_list_lesson_type_idx" ON "waiting_list" USING btree ("school_id","lesson_type_id","active","created_at");
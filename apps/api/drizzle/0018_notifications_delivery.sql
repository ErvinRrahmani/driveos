ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "skip_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key" ON "notifications" USING btree ("school_id","user_id","channel","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("school_id","scheduled_for") WHERE "notifications"."status" = 'scheduled';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_check" CHECK ("notifications"."user_id" is not null or "notifications"."address" is not null);--> statement-breakpoint
-- The notification dispatcher runs in a school scope without a user and needs the push tokens of that school's members.
CREATE POLICY "devices_school_members" ON "devices" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "memberships" m
       WHERE m.user_id = "devices".user_id
         AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid
    )
  );

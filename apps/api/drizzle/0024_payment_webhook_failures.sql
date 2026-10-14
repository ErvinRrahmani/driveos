CREATE TABLE "payment_webhook_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"provider" text NOT NULL,
	"provider_ref" text,
	"reason" text NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_webhook_failures_failed_at_idx" ON "payment_webhook_failures" USING btree ("failed_at");--> statement-breakpoint
-- Webhooks arrive before the school is known, so school_id may be null; app_rw may only append, app_system reads for alerts.
REVOKE SELECT, UPDATE, DELETE ON "payment_webhook_failures" FROM app_rw;
--> statement-breakpoint
ALTER TABLE "payment_webhook_failures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_webhook_failures" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "payment_webhook_failures_append" ON "payment_webhook_failures" FOR INSERT
  WITH CHECK (school_id IS NULL OR school_id = nullif(current_setting('app.school_id', true), '')::uuid);

CREATE TYPE "public"."entitlements_kind" AS ENUM('premium_theory', 'exam_car');--> statement-breakpoint
CREATE TYPE "public"."invoices_kind" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoices_status" AS ENUM('draft', 'issued', 'paid');--> statement-breakpoint
CREATE TYPE "public"."ledger_entries_entry_type" AS ENUM('purchase', 'debit', 'restore', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payments_method" AS ENUM('in_app', 'cash', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payments_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."platform_charges_kind" AS ENUM('base_subscription', 'student_fee', 'student_fee_reversal', 'take_rate');--> statement-breakpoint
CREATE TYPE "public"."platform_charges_status" AS ENUM('pending', 'statemented');--> statement-breakpoint
CREATE TYPE "public"."platform_statements_paid_method" AS ENUM('bank_transfer', 'cash');--> statement-breakpoint
CREATE TYPE "public"."platform_statements_status" AS ENUM('issued', 'paid');--> statement-breakpoint
CREATE TYPE "public"."price_items_entitlement_kind" AS ENUM('premium_theory', 'exam_car');--> statement-breakpoint
CREATE TYPE "public"."price_items_kind" AS ENUM('lesson', 'package', 'upsell', 'fee');--> statement-breakpoint
CREATE TYPE "public"."refunds_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."contract_signatures_signer_role" AS ENUM('student', 'guardian', 'school');--> statement-breakpoint
CREATE TYPE "public"."contracts_status" AS ENUM('pending', 'signed');--> statement-breakpoint
CREATE TYPE "public"."documents_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."devices_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."memberships_status" AS ENUM('invited', 'pending_consent', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."refresh_tokens_client" AS ENUM('web', 'mobile');--> statement-breakpoint
CREATE TYPE "public"."conversations_kind" AS ENUM('student_school', 'student_instructor');--> statement-breakpoint
CREATE TYPE "public"."notifications_channel" AS ENUM('push', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."notifications_status" AS ENUM('scheduled', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."change_feed_op" AS ENUM('upsert', 'delete', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."lesson_types_kind" AS ENUM('lesson', 'exam');--> statement-breakpoint
CREATE TYPE "public"."lesson_types_requires_entitlement" AS ENUM('exam_car');--> statement-breakpoint
CREATE TYPE "public"."lessons_booked_via" AS ENUM('office', 'instructor', 'student', 'parent', 'slot_offer', 'sync');--> statement-breakpoint
CREATE TYPE "public"."lessons_status" AS ENUM('booked', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."slot_offers_source" AS ENUM('cancellation', 'gap', 'manual');--> statement-breakpoint
CREATE TYPE "public"."slot_offers_status" AS ENUM('open', 'taken', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sync_operations_status" AS ENUM('applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."school_payment_accounts_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."schools_status" AS ENUM('onboarding', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."question_packs_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."theory_sessions_mode" AS ENUM('practice', 'mock', 'mistakes');--> statement-breakpoint
CREATE TYPE "public"."students_status" AS ENUM('active', 'archived', 'anonymized');--> statement-breakpoint
CREATE TYPE "public"."test_attempts_kind" AS ENUM('theory', 'practical');--> statement-breakpoint
CREATE TYPE "public"."test_attempts_result" AS ENUM('passed', 'failed');--> statement-breakpoint
CREATE TABLE "dead_letters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscriber" text NOT NULL,
	"event_id" uuid NOT NULL,
	"error" text NOT NULL,
	"attempts" integer NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_deliveries" (
	"subscriber" text NOT NULL,
	"event_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_deliveries_pkey" PRIMARY KEY("subscriber","event_id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"school_id" uuid,
	"type" text NOT NULL,
	"version" integer NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"actor_user_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_id_key" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "entitlements_kind" NOT NULL,
	"payment_id" uuid,
	"granted_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_lesson_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" smallint NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"school_id" uuid NOT NULL,
	"series" text NOT NULL,
	"next_number" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_counters_pkey" PRIMARY KEY("school_id","series")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"price_item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_minor" bigint NOT NULL,
	"tax_rate_bp" integer NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "invoices_kind" NOT NULL,
	"credit_note_for_id" uuid,
	"series" text NOT NULL,
	"number" bigint NOT NULL,
	"issued_at" timestamp with time zone,
	"seller_snapshot" jsonb NOT NULL,
	"buyer_snapshot" jsonb NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "invoices_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_school_series_number_key" UNIQUE("school_id","series","number")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"entry_type" "ledger_entries_entry_type" NOT NULL,
	"minutes" integer NOT NULL,
	"lesson_id" uuid,
	"payment_id" uuid,
	"refund_id" uuid,
	"price_item_id" uuid,
	"note" text,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payer_user_id" uuid,
	"invoice_id" uuid,
	"method" "payments_method" NOT NULL,
	"provider" text,
	"provider_ref" text,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "payments_status" NOT NULL,
	"recorded_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_provider_ref_key" UNIQUE("provider","provider_ref")
);
--> statement-breakpoint
CREATE TABLE "platform_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "platform_charges_kind" NOT NULL,
	"student_id" uuid,
	"period_month" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"statement_id" uuid,
	"status" "platform_charges_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"month" date NOT NULL,
	"total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "platform_statements_status" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_method" "platform_statements_paid_method",
	"paid_reference" text,
	"marked_paid_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "price_items_kind" NOT NULL,
	"credit_minutes" integer,
	"entitlement_kind" "price_items_entitlement_kind",
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"tax_rate_bp" integer NOT NULL,
	"active" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"minutes_removed" integer NOT NULL,
	"reason" text NOT NULL,
	"provider_ref" text,
	"credit_note_id" uuid,
	"status" "refunds_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"signer_role" "contract_signatures_signer_role" NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"ip" "inet" NOT NULL,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"body_snapshot" text NOT NULL,
	"requires_guardian" boolean NOT NULL,
	"status" "contracts_status" NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"owner_student_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"status" "documents_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "devices_platform" NOT NULL,
	"push_token" text NOT NULL,
	"locale" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_push_token_key" UNIQUE("push_token")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"phone" text,
	"email" text,
	"student_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "membership_branches" (
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_branches_pkey" PRIMARY KEY("membership_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roles" text[] NOT NULL,
	"status" "memberships_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_school_user_key" UNIQUE("school_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_grants" (
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_grants_pkey" PRIMARY KEY("membership_id","permission")
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"membership_id" uuid NOT NULL,
	"client" "refresh_tokens_client" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_key" UNIQUE("phone"),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" "conversations_kind" NOT NULL,
	"student_id" uuid NOT NULL,
	"instructor_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notifications_channel" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notifications_status" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"support_session_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"base_amount_minor" bigint NOT NULL,
	"student_fee_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"max_instructor_seats" integer,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_admin_user_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"month" date NOT NULL,
	"currency" text NOT NULL,
	"revenue_in_app_minor" bigint NOT NULL,
	"revenue_recorded_minor" bigint NOT NULL,
	"inapp_share_bp" integer NOT NULL,
	"late_cancellations_kept" integer NOT NULL,
	"late_cancel_minutes_kept" integer NOT NULL,
	"no_show_rate_bp" integer NOT NULL,
	"no_show_rate_prev3m_bp" integer NOT NULL,
	"upsells_sold" integer NOT NULL,
	"upsell_revenue_minor" bigint NOT NULL,
	"slots_filled" integer NOT NULL,
	"slot_fill_minutes" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_reports_school_month_key" UNIQUE("school_id","month")
);
--> statement-breakpoint
CREATE TABLE "rm_school_metrics_daily" (
	"school_id" uuid NOT NULL,
	"day" date NOT NULL,
	"currency" text NOT NULL,
	"revenue_in_app_minor" bigint NOT NULL,
	"revenue_recorded_minor" bigint NOT NULL,
	"refunds_minor" bigint NOT NULL,
	"lessons_completed" integer NOT NULL,
	"late_cancellations" integer NOT NULL,
	"late_cancel_minutes_kept" integer NOT NULL,
	"no_shows" integer NOT NULL,
	"upsells_sold" integer NOT NULL,
	"upsell_revenue_minor" bigint NOT NULL,
	"package_minutes_sold" integer NOT NULL,
	"slots_offered" integer NOT NULL,
	"slots_filled" integer NOT NULL,
	"slot_fill_minutes" integer NOT NULL,
	"instructor_minutes_available" integer NOT NULL,
	"instructor_minutes_booked" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rm_school_metrics_daily_pkey" PRIMARY KEY("school_id","day")
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_feed" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" "change_feed_op" NOT NULL,
	"audience_membership_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "lesson_types_kind" NOT NULL,
	"licence_class" text NOT NULL,
	"minutes" integer NOT NULL,
	"credit_minutes" integer NOT NULL,
	"requires_vehicle" boolean NOT NULL,
	"requires_entitlement" "lesson_types_requires_entitlement",
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"lesson_type_id" uuid NOT NULL,
	"credit_minutes" integer NOT NULL,
	"period" "tstzrange" NOT NULL,
	"status" "lessons_status" NOT NULL,
	"pickup_address" text NOT NULL,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"booked_by_membership_id" uuid NOT NULL,
	"booked_via" "lessons_booked_via" NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_membership_id" uuid,
	"cancel_reason" text,
	"late_cancel" boolean DEFAULT false NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"lesson_type_id" uuid NOT NULL,
	"period" "tstzrange" NOT NULL,
	"source" "slot_offers_source" NOT NULL,
	"offered_to_student_ids" uuid[] NOT NULL,
	"accepted_by_student_id" uuid,
	"lesson_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "slot_offers_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"school_id" uuid NOT NULL,
	"op_id" uuid PRIMARY KEY NOT NULL,
	"membership_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "sync_operations_status" NOT NULL,
	"result" jsonb NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"period" "tstzrange" NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiting_list" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_type_id" uuid NOT NULL,
	"preferred_windows" jsonb NOT NULL,
	"area" text NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"branch_id" uuid,
	"weekday" smallint NOT NULL,
	"opens" time NOT NULL,
	"closes" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_payment_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"account_ref" text NOT NULL,
	"status" "school_payment_accounts_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_payment_accounts_school_provider_key" UNIQUE("school_id","provider")
);
--> statement-breakpoint
CREATE TABLE "school_settings" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"cancellation_window_hours" integer DEFAULT 24 NOT NULL,
	"allow_negative_balance" boolean DEFAULT false NOT NULL,
	"min_gap_minutes" integer DEFAULT 0 NOT NULL,
	"age_of_majority" smallint DEFAULT 18 NOT NULL,
	"quiet_hours_start" time DEFAULT '21:00' NOT NULL,
	"quiet_hours_end" time DEFAULT '08:00' NOT NULL,
	"slot_offer_ttl_minutes" integer DEFAULT 120 NOT NULL,
	"theory_premium_free" boolean DEFAULT false NOT NULL,
	"chat_retention_months" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"address" text NOT NULL,
	"country_code" text NOT NULL,
	"time_zone" text NOT NULL,
	"currency" text NOT NULL,
	"locale" text NOT NULL,
	"status" "schools_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"make_model" text NOT NULL,
	"transmission" text NOT NULL,
	"licence_class" text NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"licence_class" text NOT NULL,
	"language" text NOT NULL,
	"version" integer NOT NULL,
	"exam_rules" jsonb NOT NULL,
	"status" "question_packs_status" NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pack_id" uuid NOT NULL,
	"external_ref" text NOT NULL,
	"category" text NOT NULL,
	"body" jsonb NOT NULL,
	"media_key" text,
	"answers" jsonb NOT NULL,
	"correct" jsonb NOT NULL,
	"points" smallint NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theory_answers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"given" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theory_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"mode" "theory_sessions_mode" NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"score" integer,
	"max_score" integer,
	"passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_name" text NOT NULL,
	"licence_class" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_text_version" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"body" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"syllabus_item_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"note" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rm_student_list" (
	"school_id" uuid NOT NULL,
	"student_id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"licence_class" text NOT NULL,
	"status" text NOT NULL,
	"primary_instructor_name" text,
	"balance_minutes" integer NOT NULL,
	"next_lesson_at" timestamp with time zone,
	"last_lesson_at" timestamp with time zone,
	"progress_pct" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_instructors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"instructor_membership_id" uuid NOT NULL,
	"is_primary" boolean NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"unassigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"date_of_birth" date NOT NULL,
	"licence_class" text NOT NULL,
	"exam_language" text NOT NULL,
	"test_date" date,
	"area" text,
	"pickup_address" text,
	"pickup_lat" double precision,
	"pickup_lng" double precision,
	"status" "students_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"licence_class" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "test_attempts_kind" NOT NULL,
	"taken_on" date NOT NULL,
	"result" "test_attempts_result" NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_consumed_by_lesson_id_lessons_id_fk" FOREIGN KEY ("consumed_by_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_price_item_id_price_items_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_note_for_id_invoices_id_fk" FOREIGN KEY ("credit_note_for_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_price_item_id_price_items_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_membership_id_memberships_id_fk" FOREIGN KEY ("recorded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_charges" ADD CONSTRAINT "platform_charges_statement_id_platform_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."platform_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_statements" ADD CONSTRAINT "platform_statements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_statements" ADD CONSTRAINT "platform_statements_marked_paid_by_user_id_users_id_fk" FOREIGN KEY ("marked_paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_credit_note_id_invoices_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_student_id_students_id_fk" FOREIGN KEY ("owner_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branches" ADD CONSTRAINT "membership_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_support_session_id_support_sessions_id_fk" FOREIGN KEY ("support_session_id") REFERENCES "public"."support_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_platform_admin_user_id_fk" FOREIGN KEY ("platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_reports" ADD CONSTRAINT "growth_reports_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ADD CONSTRAINT "rm_school_metrics_daily_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_feed" ADD CONSTRAINT "change_feed_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_feed" ADD CONSTRAINT "change_feed_audience_membership_id_memberships_id_fk" FOREIGN KEY ("audience_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_types" ADD CONSTRAINT "lesson_types_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_booked_by_membership_id_memberships_id_fk" FOREIGN KEY ("booked_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_cancelled_by_membership_id_memberships_id_fk" FOREIGN KEY ("cancelled_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_accepted_by_student_id_students_id_fk" FOREIGN KEY ("accepted_by_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_lesson_type_id_lesson_types_id_fk" FOREIGN KEY ("lesson_type_id") REFERENCES "public"."lesson_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opening_hours" ADD CONSTRAINT "opening_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_payment_accounts" ADD CONSTRAINT "school_payment_accounts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_pack_id_question_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."question_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_answers" ADD CONSTRAINT "theory_answers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_answers" ADD CONSTRAINT "theory_answers_session_id_theory_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."theory_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_answers" ADD CONSTRAINT "theory_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_sessions" ADD CONSTRAINT "theory_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_sessions" ADD CONSTRAINT "theory_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_sessions" ADD CONSTRAINT "theory_sessions_pack_id_question_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."question_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_notes" ADD CONSTRAINT "private_notes_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_syllabus_item_id_syllabus_items_id_fk" FOREIGN KEY ("syllabus_item_id") REFERENCES "public"."syllabus_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_student_list" ADD CONSTRAINT "rm_student_list_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rm_student_list" ADD CONSTRAINT "rm_student_list_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_instructors" ADD CONSTRAINT "student_instructors_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_instructors" ADD CONSTRAINT "student_instructors_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_instructors" ADD CONSTRAINT "student_instructors_instructor_membership_id_memberships_id_fk" FOREIGN KEY ("instructor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_items" ADD CONSTRAINT "syllabus_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
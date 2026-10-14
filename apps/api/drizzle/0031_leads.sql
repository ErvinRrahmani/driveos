CREATE TYPE "public"."leads_source" AS ENUM('page', 'manual');--> statement-breakpoint
CREATE TYPE "public"."leads_status" AS ENUM('new', 'contacted', 'converted', 'lost');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"status" "leads_status" DEFAULT 'new' NOT NULL,
	"source" "leads_source" NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"licence_class" text NOT NULL,
	"message" text,
	"is_minor" boolean NOT NULL,
	"guardian_name" text,
	"guardian_contact" text,
	"consent_text_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"note" text,
	"student_id" uuid,
	"converted_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"lost_reason" text,
	"request_ip_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_contact_check" CHECK ("leads"."phone" is not null or "leads"."email" is not null),
	CONSTRAINT "leads_guardian_check" CHECK (not "leads"."is_minor" or ("leads"."guardian_name" is not null and "leads"."guardian_contact" is not null))
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_status_created_idx" ON "leads" USING btree ("school_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("school_id",lower("email"));--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("school_id","phone");
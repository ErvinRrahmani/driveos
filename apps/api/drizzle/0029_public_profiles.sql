CREATE TYPE "public"."school_reviews_status" AS ENUM('pending', 'approved', 'hidden');--> statement-breakpoint
CREATE TABLE "school_public_profiles" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"headline" text,
	"description" text,
	"phone" text,
	"whatsapp_number" text,
	"instagram_url" text,
	"facebook_url" text,
	"external_review_url" text,
	"show_prices" boolean DEFAULT true NOT NULL,
	"show_instructors" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_public_profiles_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "school_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"display_name" text NOT NULL,
	"status" "school_reviews_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"moderated_at" timestamp with time zone,
	"moderated_by_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_reviews_student_key" UNIQUE("student_id"),
	CONSTRAINT "school_reviews_rating_check" CHECK ("school_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "school_public_profiles" ADD CONSTRAINT "school_public_profiles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_reviews" ADD CONSTRAINT "school_reviews_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;
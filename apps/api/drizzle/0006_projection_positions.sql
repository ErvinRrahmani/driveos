CREATE TABLE "projection_positions" (
	"school_id" uuid NOT NULL,
	"projection" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projection_positions_pkey" PRIMARY KEY("projection","aggregate_type","aggregate_id")
);
--> statement-breakpoint
ALTER TABLE "projection_positions" ADD CONSTRAINT "projection_positions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_positions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "projection_positions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "projection_positions_tenant" ON "projection_positions" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);

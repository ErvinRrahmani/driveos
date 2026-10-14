ALTER TABLE "rm_lead_students" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_lead_students" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_lead_students_tenant" ON "rm_lead_students" FOR ALL
  USING ((school_id = (NULLIF(current_setting('app.school_id'::text, true), ''::text))::uuid))
  WITH CHECK ((school_id = (NULLIF(current_setting('app.school_id'::text, true), ''::text))::uuid));

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "leads_tenant" ON "leads" FOR ALL
  USING ((school_id = (NULLIF(current_setting('app.school_id'::text, true), ''::text))::uuid))
  WITH CHECK ((school_id = (NULLIF(current_setting('app.school_id'::text, true), ''::text))::uuid));

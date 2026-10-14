ALTER TABLE "school_reviews" ADD CONSTRAINT "school_reviews_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id");
--> statement-breakpoint
ALTER TABLE "school_public_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_public_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_public_profiles_tenant" ON "school_public_profiles" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "school_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_reviews" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_reviews_tenant" ON "school_reviews" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT ON "school_public_profiles" TO driveos_definer;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; it is revoked again below.
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
-- A public page request has no school; the slug is global. Returns the school only when its profile
-- is published and the school is active.
CREATE FUNCTION school_id_for_public_slug(slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.school_id
    FROM school_public_profiles p
    JOIN schools s ON s.id = p.school_id
   WHERE p.slug = school_id_for_public_slug.slug
     AND p.published
     AND s.status = 'active'
$$;
--> statement-breakpoint
ALTER FUNCTION school_id_for_public_slug(text) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION school_id_for_public_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_id_for_public_slug(text) TO app_rw;

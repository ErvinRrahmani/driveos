ALTER TABLE "plans" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "school_payment_accounts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
GRANT SELECT ON "platform_statements" TO driveos_definer;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; it is revoked again at the end.
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
CREATE FUNCTION platform_list_statements(filter_status text, filter_school_id uuid, filter_month date,
                                         after_id uuid, max_rows integer)
  RETURNS TABLE(statement_id uuid, school_id uuid, school_name text, month date, total_minor bigint,
                currency text, status text, issued_at timestamptz, paid_at timestamptz,
                paid_method text, paid_reference text, marked_paid_by_user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT ps.id, ps.school_id, s.name, ps.month, ps.total_minor, ps.currency, ps.status::text,
         ps.issued_at, ps.paid_at, ps.paid_method::text, ps.paid_reference, ps.marked_paid_by_user_id
    FROM platform_statements ps
    JOIN schools s ON s.id = ps.school_id
   WHERE EXISTS (SELECT 1 FROM platform_admins pa
                  WHERE pa.user_id = nullif(current_setting('app.user_id', true), '')::uuid)
     AND (filter_status IS NULL OR ps.status::text = filter_status)
     AND (filter_school_id IS NULL OR ps.school_id = filter_school_id)
     AND (filter_month IS NULL OR ps.month = filter_month)
     AND (after_id IS NULL OR (ps.month, ps.issued_at, ps.id) <
          (SELECT c.month, c.issued_at, c.id FROM platform_statements c WHERE c.id = after_id))
   ORDER BY ps.month DESC, ps.issued_at DESC, ps.id DESC
   LIMIT greatest(least(coalesce(max_rows, 50), 201), 1)
$$;
--> statement-breakpoint
CREATE FUNCTION platform_statement_school(statement_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT ps.school_id
    FROM platform_statements ps
   WHERE ps.id = platform_statement_school.statement_id
     AND EXISTS (SELECT 1 FROM platform_admins pa
                  WHERE pa.user_id = nullif(current_setting('app.user_id', true), '')::uuid)
$$;
--> statement-breakpoint
ALTER FUNCTION platform_list_statements(text, uuid, date, uuid, integer) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION platform_statement_school(uuid) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_list_statements(text, uuid, date, uuid, integer),
  platform_statement_school(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_list_statements(text, uuid, date, uuid, integer),
  platform_statement_school(uuid) TO app_rw;

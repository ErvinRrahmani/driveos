GRANT USAGE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
GRANT SELECT ON "users", "memberships", "platform_admins", "invitations", "schools", "payments" TO driveos_definer;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; it is revoked again at the end.
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
CREATE FUNCTION auth_find_user_by_contact(contact text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id
    FROM users u
   WHERE u.phone = auth_find_user_by_contact.contact
      OR lower(u.email) = lower(auth_find_user_by_contact.contact)
   ORDER BY (u.phone = auth_find_user_by_contact.contact) DESC NULLS LAST, u.id
   LIMIT 1
$$;
--> statement-breakpoint
CREATE FUNCTION auth_login_allowed(contact text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1
             FROM users u
            WHERE (u.phone = auth_login_allowed.contact
                   OR lower(u.email) = lower(auth_login_allowed.contact))
              AND (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active')
                   OR EXISTS (SELECT 1 FROM platform_admins p WHERE p.user_id = u.id))
         )
      OR EXISTS (
           SELECT 1
             FROM invitations i
            WHERE (i.phone = auth_login_allowed.contact
                   OR lower(i.email) = lower(auth_login_allowed.contact))
              AND i.accepted_at IS NULL
              AND i.expires_at > now()
         )
$$;
--> statement-breakpoint
CREATE FUNCTION auth_memberships_for_user(user_id uuid)
  RETURNS TABLE(membership_id uuid, school_id uuid, school_name text, roles text[], status text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.school_id, s.name, m.roles, m.status::text
    FROM memberships m
    JOIN schools s ON s.id = m.school_id
   WHERE m.user_id = auth_memberships_for_user.user_id
   ORDER BY s.name, m.id
$$;
--> statement-breakpoint
CREATE FUNCTION auth_invitation_by_token_hash(hash text)
  RETURNS TABLE(invitation_id uuid, school_id uuid, roles text[], phone text, email text,
                student_id uuid, expires_at timestamptz, accepted_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.school_id, i.roles, i.phone, i.email, i.student_id, i.expires_at, i.accepted_at
    FROM invitations i
   WHERE i.token_hash = auth_invitation_by_token_hash.hash
$$;
--> statement-breakpoint
CREATE FUNCTION billing_school_for_payment(provider text, provider_ref text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.school_id
    FROM payments p
   WHERE p.provider = billing_school_for_payment.provider
     AND p.provider_ref = billing_school_for_payment.provider_ref
$$;
--> statement-breakpoint
ALTER FUNCTION auth_find_user_by_contact(text) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION auth_login_allowed(text) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION auth_memberships_for_user(uuid) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION auth_invitation_by_token_hash(text) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION billing_school_for_payment(text, text) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_find_user_by_contact(text), auth_login_allowed(text),
  auth_memberships_for_user(uuid), auth_invitation_by_token_hash(text),
  billing_school_for_payment(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_find_user_by_contact(text), auth_login_allowed(text),
  auth_memberships_for_user(uuid), auth_invitation_by_token_hash(text),
  billing_school_for_payment(text, text) TO app_rw;

GRANT SELECT ON "payment_webhook_failures" TO driveos_definer;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; it is revoked again at the end.
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
-- The webhook-failure alert probe runs in the worker without a school; this replaces its app_system read.
CREATE FUNCTION billing_count_webhook_failures(since timestamptz) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT count(*)
    FROM payment_webhook_failures f
   WHERE f.failed_at > billing_count_webhook_failures.since
     AND nullif(current_setting('app.school_id', true), '') IS NULL
$$;
--> statement-breakpoint
-- The notification dispatcher runs in a school scope without a user and needs the push tokens of that
-- school's members. Replaces the devices_school_members select policy of migration 0018.
CREATE FUNCTION auth_devices_for_school_members(user_ids uuid[])
  RETURNS TABLE(device_id uuid, user_id uuid, push_token text, platform text, locale text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.user_id, d.push_token, d.platform::text, d.locale
    FROM devices d
   WHERE d.user_id = ANY (auth_devices_for_school_members.user_ids)
     AND EXISTS (SELECT 1 FROM memberships m
                  WHERE m.user_id = d.user_id
                    AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid)
   ORDER BY d.user_id, d.last_seen_at, d.id
$$;
--> statement-breakpoint
-- Worker jobs (a school scope without app.user_id) delete a member's device whose push token the provider
-- rejected, unless it re-registered since. Replaces the devices_school_members_prune delete policy of 0025.
CREATE FUNCTION auth_prune_device(device_id uuid, user_id uuid, seen_before timestamptz) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  DELETE FROM devices d
   WHERE d.id = auth_prune_device.device_id
     AND d.user_id = auth_prune_device.user_id
     AND d.last_seen_at <= auth_prune_device.seen_before
     AND nullif(current_setting('app.user_id', true), '') IS NULL
     AND EXISTS (SELECT 1 FROM memberships m
                  WHERE m.user_id = d.user_id
                    AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid)
$$;
--> statement-breakpoint
ALTER FUNCTION billing_count_webhook_failures(timestamptz) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION auth_devices_for_school_members(uuid[]) OWNER TO driveos_definer;
--> statement-breakpoint
ALTER FUNCTION auth_prune_device(uuid, uuid, timestamptz) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION billing_count_webhook_failures(timestamptz),
  auth_devices_for_school_members(uuid[]), auth_prune_device(uuid, uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION billing_count_webhook_failures(timestamptz),
  auth_devices_for_school_members(uuid[]), auth_prune_device(uuid, uuid, timestamptz) TO app_rw;
--> statement-breakpoint
DROP POLICY "devices_school_members" ON "devices";
--> statement-breakpoint
DROP POLICY "devices_school_members_prune" ON "devices";

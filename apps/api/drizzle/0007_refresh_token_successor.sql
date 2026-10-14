ALTER TABLE "refresh_tokens" ADD COLUMN "successor_id" uuid;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_successor_id_refresh_tokens_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, DELETE ON "devices" TO driveos_definer;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; it is revoked again at the end.
GRANT CREATE ON SCHEMA public TO driveos_definer;
--> statement-breakpoint
-- A push token belongs to whoever presents it: registering it removes it from any other user's device row, which RLS (devices_own) hides from the caller.
CREATE FUNCTION auth_release_push_token(push_token text) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  DELETE FROM devices d
   WHERE d.push_token = auth_release_push_token.push_token
     AND nullif(current_setting('app.user_id', true), '') IS NOT NULL
     AND d.user_id <> nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
ALTER FUNCTION auth_release_push_token(text) OWNER TO driveos_definer;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM driveos_definer;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_release_push_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_release_push_token(text) TO app_rw;

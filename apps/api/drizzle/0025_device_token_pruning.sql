-- Worker jobs run in a school scope without a user; they may delete a member's device whose push token the provider rejected. Requests always carry a user and stay limited to devices_own.
CREATE POLICY "devices_school_members_prune" ON "devices" FOR DELETE
  USING (
    nullif(current_setting('app.user_id', true), '') IS NULL
    AND EXISTS (
      SELECT 1 FROM "memberships" m
       WHERE m.user_id = "devices".user_id
         AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid
    )
  );

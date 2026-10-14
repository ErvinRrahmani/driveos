-- nullif: an unset or reset app.school_id reads as '' or NULL; both must mean "no school" (zero rows), never a cast error.
GRANT USAGE ON SCHEMA public TO app_rw, app_system;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw, app_system;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_rw, app_system;
--> statement-breakpoint
REVOKE SELECT, UPDATE, DELETE ON "outbox" FROM app_rw;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "audit_log" FROM app_rw;
--> statement-breakpoint
REVOKE ALL ON "event_deliveries", "dead_letters" FROM app_rw;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE driveos_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw, app_system;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE driveos_owner IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_rw, app_system;
--> statement-breakpoint
ALTER TABLE "availability" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "availability_tenant" ON "availability" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "branches_tenant" ON "branches" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "change_feed" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "change_feed" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "change_feed_tenant" ON "change_feed" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "contract_signatures" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_signatures" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contract_signatures_tenant" ON "contract_signatures" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "contract_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contract_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contract_templates_tenant" ON "contract_templates" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "contracts_tenant" ON "contracts" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "conversation_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversation_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversation_members_tenant" ON "conversation_members" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversations_tenant" ON "conversations" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "documents_tenant" ON "documents" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "enrolments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "enrolments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "enrolments_tenant" ON "enrolments" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entitlements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "entitlements_tenant" ON "entitlements" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "growth_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "growth_reports" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "growth_reports_tenant" ON "growth_reports" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "guardian_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "guardian_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "guardian_links_tenant" ON "guardian_links" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant" ON "idempotency_keys" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invitations_tenant" ON "invitations" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "invoice_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_counters" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoice_counters_tenant" ON "invoice_counters" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoice_lines_tenant" ON "invoice_lines" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invoices_tenant" ON "invoices" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ledger_entries_tenant" ON "ledger_entries" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "lesson_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lesson_types" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "lesson_types_tenant" ON "lesson_types" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lessons" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "lessons_tenant" ON "lessons" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "membership_branches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "membership_branches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "membership_branches_tenant" ON "membership_branches" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "memberships_tenant" ON "memberships" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "messages_tenant" ON "messages" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notifications_tenant" ON "notifications" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "opening_hours" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "opening_hours" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "opening_hours_tenant" ON "opening_hours" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "payments_tenant" ON "payments" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "permission_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "permission_grants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "permission_grants_tenant" ON "permission_grants" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "platform_charges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_charges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "platform_charges_tenant" ON "platform_charges" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "platform_statements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_statements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "platform_statements_tenant" ON "platform_statements" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "price_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "price_items_tenant" ON "price_items" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "private_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "private_notes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "private_notes_tenant" ON "private_notes" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "progress_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "progress_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "progress_entries_tenant" ON "progress_entries" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "refunds" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "refunds_tenant" ON "refunds" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_school_metrics_daily" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_school_metrics_daily_tenant" ON "rm_school_metrics_daily" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "rm_student_list" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rm_student_list" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rm_student_list_tenant" ON "rm_student_list" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "school_payment_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_payment_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_payment_accounts_tenant" ON "school_payment_accounts" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "school_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "school_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "school_settings_tenant" ON "school_settings" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "schools" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "schools_tenant" ON "schools" FOR ALL
  USING (id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "slot_offers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "slot_offers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "slot_offers_tenant" ON "slot_offers" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "student_instructors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_instructors" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "student_instructors_tenant" ON "student_instructors" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "students_tenant" ON "students" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subscriptions_tenant" ON "subscriptions" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "syllabus_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "syllabus_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "syllabus_items_tenant" ON "syllabus_items" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "sync_operations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_operations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sync_operations_tenant" ON "sync_operations" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "test_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "test_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "test_attempts_tenant" ON "test_attempts" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "theory_answers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "theory_answers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "theory_answers_tenant" ON "theory_answers" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "theory_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "theory_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "theory_sessions_tenant" ON "theory_sessions" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "time_off" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "time_off" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "time_off_tenant" ON "time_off" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vehicles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "vehicles_tenant" ON "vehicles" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "waiting_list" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "waiting_list" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "waiting_list_tenant" ON "waiting_list" FOR ALL
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_select" ON "users" FOR SELECT
  USING (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM "memberships" m
       WHERE m.user_id = "users".id
         AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid
    )
  );
--> statement-breakpoint
-- A new user cannot have a membership yet (memberships.user_id references users), so inserts are open; reads stay restricted.
CREATE POLICY "users_insert" ON "users" FOR INSERT
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "users_update" ON "users" FOR UPDATE
  USING (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM "memberships" m
       WHERE m.user_id = "users".id
         AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid
    )
  )
  WITH CHECK (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM "memberships" m
       WHERE m.user_id = "users".id
         AND m.school_id = nullif(current_setting('app.school_id', true), '')::uuid
    )
  );
--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "devices_own" ON "devices" FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_admins" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "platform_admins_own" ON "platform_admins" FOR ALL
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_log_select" ON "audit_log" FOR SELECT
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" FOR INSERT
  WITH CHECK (true);

export const SPEC_TABLES = {
  identity: [
    'users',
    'platform_admins',
    'memberships',
    'membership_branches',
    'permission_grants',
    'invitations',
    'otp_codes',
    'refresh_tokens',
    'devices',
  ],
  school: [
    'schools',
    'school_settings',
    'opening_hours',
    'branches',
    'vehicles',
    'school_payment_accounts',
    'school_public_profiles',
    'school_reviews',
  ],
  scheduling: [
    'lesson_types',
    'availability',
    'availability_versions',
    'time_off',
    'lessons',
    'waiting_list',
    'slot_offers',
    'sync_operations',
    'change_feed',
  ],
  training: [
    'students',
    'student_instructors',
    'guardian_links',
    'enrolments',
    'syllabus_items',
    'progress_entries',
    'private_notes',
    'test_attempts',
    'rm_student_list',
    'rm_student_lessons',
  ],
  theory: ['question_packs', 'questions', 'theory_sessions', 'theory_answers'],
  billing: [
    'price_items',
    'ledger_entries',
    'entitlements',
    'invoice_counters',
    'invoices',
    'invoice_lines',
    'payments',
    'refunds',
    'idempotency_keys',
    'platform_charges',
    'platform_statements',
    'payment_webhook_failures',
  ],
  documents: ['documents', 'contract_templates', 'contracts', 'contract_signatures'],
  messaging: ['conversations', 'conversation_members', 'messages', 'notifications'],
  reporting: [
    'rm_school_metrics_daily',
    'rm_test_attempts_daily',
    'rm_metric_sources',
    'rm_instructor_availability',
    'rm_instructor_time_off',
    'growth_reports',
  ],
  platform: ['plans', 'subscriptions', 'support_sessions', 'audit_log'],
  kernel: ['outbox', 'event_deliveries', 'dead_letters', 'projection_positions'],
} as const;

export const ALL_TABLES: string[] = Object.values(SPEC_TABLES).flat().sort();

export const GLOBAL_TABLES: ReadonlySet<string> = new Set([
  'users',
  'platform_admins',
  'otp_codes',
  'refresh_tokens',
  'devices',
  'question_packs',
  'questions',
  'plans',
  'support_sessions',
  'audit_log',
]);

export const SYSTEM_TABLES: ReadonlySet<string> = new Set([
  'outbox',
  'event_deliveries',
  'dead_letters',
  'payment_webhook_failures',
]);

export const SYSTEM_TABLES_WITH_RLS: ReadonlySet<string> = new Set(['payment_webhook_failures']);

export const TENANT_TABLES: string[] = ALL_TABLES.filter(
  (t) => !GLOBAL_TABLES.has(t) && !SYSTEM_TABLES.has(t),
);

export const TENANT_TABLES_WITH_SCHOOL_ID: string[] = TENANT_TABLES.filter((t) => t !== 'schools');

export const GLOBAL_TABLES_WITH_RLS: string[] = [
  'audit_log',
  'devices',
  'platform_admins',
  'users',
];

export const TABLES_WITHOUT_RLS: ReadonlySet<string> = new Set([
  ...[...GLOBAL_TABLES].filter((t) => !GLOBAL_TABLES_WITH_RLS.includes(t)),
  ...[...SYSTEM_TABLES].filter((t) => !SYSTEM_TABLES_WITH_RLS.has(t)),
]);

export const APP_RW_PRIVILEGES: Record<string, string[]> = {
  outbox: ['INSERT'],
  audit_log: ['INSERT', 'SELECT'],
  event_deliveries: [],
  dead_letters: [],
  payment_webhook_failures: ['INSERT'],
};

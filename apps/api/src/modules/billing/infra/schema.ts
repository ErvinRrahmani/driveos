import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, minor, timestamps, tstz } from '../../../kernel/db/columns.js';
import { memberships, users } from '../../identity/infra/schema.js';
import { lessons } from '../../scheduling/infra/schema.js';
import { schoolId } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

const studentRef = () =>
  uuid('student_id')
    .notNull()
    .references(() => students.id);

const membershipRef = (name: string) => uuid(name).references(() => memberships.id);

export const priceItemsKind = pgEnum('price_items_kind', ['lesson', 'package', 'upsell', 'fee']);
export const priceItemsEntitlementKind = pgEnum('price_items_entitlement_kind', [
  'premium_theory',
  'exam_car',
]);

export const priceItems = pgTable('price_items', {
  id: id(),
  schoolId: schoolId(),
  name: text('name').notNull(),
  kind: priceItemsKind('kind').notNull(),
  creditMinutes: integer('credit_minutes'),
  entitlementKind: priceItemsEntitlementKind('entitlement_kind'),
  amountMinor: minor('amount_minor').notNull(),
  currency: text('currency').notNull(),
  taxRateBp: integer('tax_rate_bp').notNull(),
  active: boolean('active').notNull(),
  showOnPublicPage: boolean('show_on_public_page').notNull().default(false),
  sortOrder: integer('sort_order').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const invoicesKind = pgEnum('invoices_kind', ['invoice', 'credit_note']);
export const invoicesStatus = pgEnum('invoices_status', ['draft', 'issued', 'paid']);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    kind: invoicesKind('kind').notNull(),
    creditNoteForId: uuid('credit_note_for_id').references((): AnyPgColumn => invoices.id),
    series: text('series').notNull(),
    number: bigint('number', { mode: 'number' }).notNull(),
    issuedAt: tstz('issued_at'),
    sellerSnapshot: jsonb('seller_snapshot').notNull(),
    buyerSnapshot: jsonb('buyer_snapshot').notNull(),
    subtotalMinor: minor('subtotal_minor').notNull(),
    taxMinor: minor('tax_minor').notNull(),
    totalMinor: minor('total_minor').notNull(),
    currency: text('currency').notNull(),
    status: invoicesStatus('status').notNull(),
    ...timestamps(),
  },
  (t) => [unique('invoices_school_series_number_key').on(t.schoolId, t.series, t.number)],
);

export const invoiceLines = pgTable('invoice_lines', {
  id: id(),
  schoolId: schoolId(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id),
  priceItemId: uuid('price_item_id').references(() => priceItems.id),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitMinor: minor('unit_minor').notNull(),
  taxRateBp: integer('tax_rate_bp').notNull(),
  taxMinor: minor('tax_minor').notNull(),
  totalMinor: minor('total_minor').notNull(),
  currency: text('currency').notNull(),
  ...timestamps(),
});

export const paymentsMethod = pgEnum('payments_method', ['in_app', 'cash', 'bank_transfer']);
export const paymentsStatus = pgEnum('payments_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    payerUserId: uuid('payer_user_id').references(() => users.id),
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    method: paymentsMethod('method').notNull(),
    provider: text('provider'),
    providerRef: text('provider_ref'),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    status: paymentsStatus('status').notNull(),
    recordedByMembershipId: membershipRef('recorded_by_membership_id'),
    priceItemId: uuid('price_item_id').references(() => priceItems.id),
    reference: text('reference'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [unique('payments_provider_provider_ref_key').on(t.provider, t.providerRef)],
);

export const refundsStatus = pgEnum('refunds_status', ['pending', 'succeeded', 'failed']);

export const refunds = pgTable('refunds', {
  id: id(),
  schoolId: schoolId(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  amountMinor: minor('amount_minor').notNull(),
  currency: text('currency').notNull(),
  minutesRemoved: integer('minutes_removed').notNull(),
  reason: text('reason').notNull(),
  providerRef: text('provider_ref'),
  creditNoteId: uuid('credit_note_id').references(() => invoices.id),
  status: refundsStatus('status').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const ledgerEntriesEntryType = pgEnum('ledger_entries_entry_type', [
  'purchase',
  'debit',
  'restore',
  'adjustment',
  'refund',
]);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    entryType: ledgerEntriesEntryType('entry_type').notNull(),
    minutes: integer('minutes').notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id),
    paymentId: uuid('payment_id').references(() => payments.id),
    refundId: uuid('refund_id').references(() => refunds.id),
    priceItemId: uuid('price_item_id').references(() => priceItems.id),
    note: text('note'),
    createdByMembershipId: membershipRef('created_by_membership_id'),
    ...timestamps(),
  },
  (t) => [index('ledger_entries_student_id_id_idx').on(t.studentId, t.id)],
);

export const entitlementsKind = pgEnum('entitlements_kind', ['premium_theory', 'exam_car']);

export const entitlements = pgTable(
  'entitlements',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    kind: entitlementsKind('kind').notNull(),
    paymentId: uuid('payment_id').references(() => payments.id),
    grantedAt: tstz('granted_at').notNull(),
    consumedAt: tstz('consumed_at'),
    consumedByLessonId: uuid('consumed_by_lesson_id').references(() => lessons.id),
    revokedAt: tstz('revoked_at'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    index('entitlements_student_id_idx').on(t.studentId),
    index('entitlements_consumed_by_lesson_id_idx').on(t.consumedByLessonId),
  ],
);

export const invoiceCounters = pgTable(
  'invoice_counters',
  {
    schoolId: schoolId(),
    series: text('series').notNull(),
    nextNumber: bigint('next_number', { mode: 'number' }).notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'invoice_counters_pkey', columns: [t.schoolId, t.series] })],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    schoolId: schoolId(),
    key: text('key').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: smallint('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'idempotency_keys_pkey', columns: [t.schoolId, t.key] })],
);

export const platformStatementsStatus = pgEnum('platform_statements_status', ['issued', 'paid']);
export const platformStatementsPaidMethod = pgEnum('platform_statements_paid_method', [
  'bank_transfer',
  'cash',
]);

export const platformStatements = pgTable('platform_statements', {
  id: id(),
  schoolId: schoolId(),
  month: date('month').notNull(),
  totalMinor: minor('total_minor').notNull(),
  currency: text('currency').notNull(),
  status: platformStatementsStatus('status').notNull(),
  issuedAt: tstz('issued_at').notNull(),
  paidAt: tstz('paid_at'),
  paidMethod: platformStatementsPaidMethod('paid_method'),
  paidReference: text('paid_reference'),
  markedPaidByUserId: uuid('marked_paid_by_user_id').references(() => users.id),
  ...timestamps(),
});

export const platformChargesKind = pgEnum('platform_charges_kind', [
  'base_subscription',
  'student_fee',
  'student_fee_reversal',
  'take_rate',
]);
export const platformChargesStatus = pgEnum('platform_charges_status', ['pending', 'statemented']);

export const platformCharges = pgTable('platform_charges', {
  id: id(),
  schoolId: schoolId(),
  kind: platformChargesKind('kind').notNull(),
  studentId: uuid('student_id').references(() => students.id),
  periodMonth: date('period_month').notNull(),
  amountMinor: minor('amount_minor').notNull(),
  currency: text('currency').notNull(),
  statementId: uuid('statement_id').references(() => platformStatements.id),
  status: platformChargesStatus('status').notNull(),
  ...timestamps(),
});

export const paymentWebhookFailures = pgTable(
  'payment_webhook_failures',
  {
    id: id(),
    schoolId: uuid('school_id'),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    reason: text('reason').notNull(),
    failedAt: tstz('failed_at').notNull(),
    ...timestamps(),
  },
  (t) => [index('payment_webhook_failures_failed_at_idx').on(t.failedAt)],
);

import {
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from '../../../kernel/db/columns.js';

export const schoolsStatus = pgEnum('schools_status', ['onboarding', 'active', 'suspended']);

export const schools = pgTable('schools', {
  id: id(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull(),
  taxId: text('tax_id'),
  address: text('address').notNull(),
  countryCode: text('country_code').notNull(),
  timeZone: text('time_zone').notNull(),
  currency: text('currency').notNull(),
  locale: text('locale').notNull(),
  status: schoolsStatus('status').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const schoolId = () =>
  uuid('school_id')
    .notNull()
    .references(() => schools.id);

export const schoolSettings = pgTable('school_settings', {
  schoolId: schoolId().primaryKey(),
  cancellationWindowHours: integer('cancellation_window_hours').notNull().default(24),
  allowNegativeBalance: boolean('allow_negative_balance').notNull().default(false),
  minGapMinutes: integer('min_gap_minutes').notNull().default(0),
  ageOfMajority: smallint('age_of_majority').notNull().default(18),
  quietHoursStart: time('quiet_hours_start').notNull().default('21:00'),
  quietHoursEnd: time('quiet_hours_end').notNull().default('08:00'),
  slotOfferTtlMinutes: integer('slot_offer_ttl_minutes').notNull().default(120),
  theoryPremiumFree: boolean('theory_premium_free').notNull().default(false),
  chatRetentionMonths: integer('chat_retention_months').notNull().default(24),
  ...timestamps(),
});

export const branches = pgTable('branches', {
  id: id(),
  schoolId: schoolId(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const openingHours = pgTable('opening_hours', {
  id: id(),
  schoolId: schoolId(),
  branchId: uuid('branch_id').references(() => branches.id),
  weekday: smallint('weekday').notNull(),
  opens: time('opens').notNull(),
  closes: time('closes').notNull(),
  ...timestamps(),
});

export const vehicles = pgTable('vehicles', {
  id: id(),
  schoolId: schoolId(),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  plate: text('plate').notNull(),
  makeModel: text('make_model').notNull(),
  transmission: text('transmission').notNull(),
  licenceClass: text('licence_class').notNull(),
  active: boolean('active').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const schoolPaymentAccountsStatus = pgEnum('school_payment_accounts_status', [
  'pending',
  'active',
  'disabled',
]);

export const schoolPaymentAccounts = pgTable(
  'school_payment_accounts',
  {
    id: id(),
    schoolId: schoolId(),
    provider: text('provider').notNull(),
    accountRef: text('account_ref').notNull(),
    status: schoolPaymentAccountsStatus('status').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [unique('school_payment_accounts_school_provider_key').on(t.schoolId, t.provider)],
);

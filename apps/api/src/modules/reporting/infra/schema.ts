import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, minor, timestamps, tstz } from '../../../kernel/db/columns.js';
import { schoolId } from '../../school/infra/schema.js';

export const rmSchoolMetricsDaily = pgTable(
  'rm_school_metrics_daily',
  {
    schoolId: schoolId(),
    day: date('day').notNull(),
    currency: text('currency').notNull(),
    revenueInAppMinor: minor('revenue_in_app_minor').notNull(),
    revenueRecordedMinor: minor('revenue_recorded_minor').notNull(),
    refundsMinor: minor('refunds_minor').notNull(),
    lessonsCompleted: integer('lessons_completed').notNull(),
    lateCancellations: integer('late_cancellations').notNull(),
    lateCancelMinutesKept: integer('late_cancel_minutes_kept').notNull(),
    noShows: integer('no_shows').notNull(),
    upsellsSold: integer('upsells_sold').notNull(),
    upsellRevenueMinor: minor('upsell_revenue_minor').notNull(),
    packageMinutesSold: integer('package_minutes_sold').notNull(),
    slotsOffered: integer('slots_offered').notNull(),
    slotsFilled: integer('slots_filled').notNull(),
    slotFillMinutes: integer('slot_fill_minutes').notNull(),
    instructorMinutesAvailable: integer('instructor_minutes_available').notNull(),
    instructorMinutesBooked: integer('instructor_minutes_booked').notNull(),
    lessonsDue: integer('lessons_due').notNull().default(0),
    leadsCaptured: integer('leads_captured').notNull().default(0),
    leadsConverted: integer('leads_converted').notNull().default(0),
    leadRevenueMinor: minor('lead_revenue_minor').notNull().default(0),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'rm_school_metrics_daily_pkey', columns: [t.schoolId, t.day] })],
);

/** Students who came from a lead, so their later payments count as lead revenue. */
export const rmLeadStudents = pgTable('rm_lead_students', {
  schoolId: schoolId(),
  studentId: uuid('student_id').primaryKey(),
  leadId: uuid('lead_id').notNull(),
  convertedOn: date('converted_on').notNull(),
  ...timestamps(),
});

export const rmTestAttemptsDaily = pgTable(
  'rm_test_attempts_daily',
  {
    schoolId: schoolId(),
    day: date('day').notNull(),
    kind: text('kind').notNull(),
    attempts: integer('attempts').notNull(),
    passed: integer('passed').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ name: 'rm_test_attempts_daily_pkey', columns: [t.schoolId, t.day, t.kind] }),
  ],
);

export const rmMetricSources = pgTable(
  'rm_metric_sources',
  {
    schoolId: schoolId(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    day: date('day').notNull(),
    counts: jsonb('counts').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({
      name: 'rm_metric_sources_pkey',
      columns: [t.schoolId, t.sourceType, t.sourceId],
    }),
  ],
);

export const rmInstructorAvailability = pgTable(
  'rm_instructor_availability',
  {
    schoolId: schoolId(),
    instructorMembershipId: uuid('instructor_membership_id').notNull(),
    version: integer('version').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    windows: jsonb('windows').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({
      name: 'rm_instructor_availability_pkey',
      columns: [t.schoolId, t.instructorMembershipId, t.version],
    }),
  ],
);

export const rmInstructorTimeOff = pgTable(
  'rm_instructor_time_off',
  {
    schoolId: schoolId(),
    timeOffId: uuid('time_off_id').notNull(),
    instructorMembershipId: uuid('instructor_membership_id').notNull(),
    startAt: tstz('start_at').notNull(),
    endAt: tstz('end_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ name: 'rm_instructor_time_off_pkey', columns: [t.schoolId, t.timeOffId] }),
    index('rm_instructor_time_off_start_idx').on(t.schoolId, t.startAt),
  ],
);

export const growthReports = pgTable(
  'growth_reports',
  {
    id: id(),
    schoolId: schoolId(),
    month: date('month').notNull(),
    currency: text('currency').notNull(),
    revenueInAppMinor: minor('revenue_in_app_minor').notNull(),
    revenueRecordedMinor: minor('revenue_recorded_minor').notNull(),
    inappShareBp: integer('inapp_share_bp').notNull(),
    lateCancellationsKept: integer('late_cancellations_kept').notNull(),
    lateCancelMinutesKept: integer('late_cancel_minutes_kept').notNull(),
    noShowRateBp: integer('no_show_rate_bp').notNull(),
    noShowRatePrev3mBp: integer('no_show_rate_prev3m_bp').notNull(),
    upsellsSold: integer('upsells_sold').notNull(),
    upsellRevenueMinor: minor('upsell_revenue_minor').notNull(),
    slotsFilled: integer('slots_filled').notNull(),
    slotFillMinutes: integer('slot_fill_minutes').notNull(),
    leadsCaptured: integer('leads_captured').notNull().default(0),
    leadsConverted: integer('leads_converted').notNull().default(0),
    leadRevenueMinor: minor('lead_revenue_minor').notNull().default(0),
    generatedAt: tstz('generated_at').notNull(),
    ...timestamps(),
  },
  (t) => [unique('growth_reports_school_month_key').on(t.schoolId, t.month)],
);

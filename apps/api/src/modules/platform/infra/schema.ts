import { boolean, foreignKey, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, minor, timestamps, tstz } from '../../../kernel/db/columns.js';
import { platformAdmins, users } from '../../identity/infra/schema.js';
import { schoolId, schools } from '../../school/infra/schema.js';

export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique('plans_code_key'),
  name: text('name').notNull(),
  baseAmountMinor: minor('base_amount_minor').notNull(),
  studentFeeMinor: minor('student_fee_minor').notNull(),
  currency: text('currency').notNull(),
  maxInstructorSeats: integer('max_instructor_seats'),
  active: boolean('active').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  schoolId: schoolId(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  startedAt: tstz('started_at').notNull(),
  endedAt: tstz('ended_at'),
  ...timestamps(),
});

export const supportSessions = pgTable(
  'support_sessions',
  {
    id: id(),
    platformAdminUserId: uuid('platform_admin_user_id').notNull(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    reason: text('reason').notNull(),
    startedAt: tstz('started_at').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    endedAt: tstz('ended_at'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'support_sessions_platform_admin_user_id_fk',
      columns: [t.platformAdminUserId],
      foreignColumns: [platformAdmins.userId],
    }),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: id(),
  schoolId: uuid('school_id').references(() => schools.id),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  supportSessionId: uuid('support_session_id').references(() => supportSessions.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason'),
  at: tstz('at').notNull(),
  ...timestamps(),
});

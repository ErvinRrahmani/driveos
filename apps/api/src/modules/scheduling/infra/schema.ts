import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { tstzrange } from '../../../kernel/db/tstzrange.js';
import { memberships } from '../../identity/infra/schema.js';
import { schoolId, vehicles } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

const membershipRef = (name: string) => uuid(name).references(() => memberships.id);

export const lessonTypesKind = pgEnum('lesson_types_kind', ['lesson', 'exam']);
export const lessonTypesRequiresEntitlement = pgEnum('lesson_types_requires_entitlement', [
  'exam_car',
]);

export const lessonTypes = pgTable('lesson_types', {
  id: id(),
  schoolId: schoolId(),
  name: text('name').notNull(),
  kind: lessonTypesKind('kind').notNull(),
  licenceClass: text('licence_class').notNull(),
  minutes: integer('minutes').notNull(),
  creditMinutes: integer('credit_minutes').notNull(),
  requiresVehicle: boolean('requires_vehicle').notNull(),
  requiresEntitlement: lessonTypesRequiresEntitlement('requires_entitlement'),
  active: boolean('active').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const availability = pgTable(
  'availability',
  {
    id: id(),
    schoolId: schoolId(),
    instructorMembershipId: membershipRef('instructor_membership_id').notNull(),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [index('availability_instructor_idx').on(t.instructorMembershipId, t.validFrom)],
);

export const availabilityVersions = pgTable('availability_versions', {
  schoolId: schoolId(),
  instructorMembershipId: membershipRef('instructor_membership_id').primaryKey(),
  version: integer('version').notNull(),
  ...timestamps(),
});

export const timeOff = pgTable('time_off', {
  id: id(),
  schoolId: schoolId(),
  instructorMembershipId: membershipRef('instructor_membership_id').notNull(),
  period: tstzrange('period').notNull(),
  reason: text('reason').notNull(),
  version: integer('version').notNull().default(1),
  ...timestamps(),
});

export const lessonsStatus = pgEnum('lessons_status', [
  'booked',
  'completed',
  'cancelled',
  'no_show',
]);
export const lessonsBookedVia = pgEnum('lessons_booked_via', [
  'office',
  'instructor',
  'student',
  'parent',
  'slot_offer',
  'sync',
]);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    instructorMembershipId: membershipRef('instructor_membership_id').notNull(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),
    lessonTypeId: uuid('lesson_type_id')
      .notNull()
      .references(() => lessonTypes.id),
    creditMinutes: integer('credit_minutes').notNull(),
    period: tstzrange('period').notNull(),
    status: lessonsStatus('status').notNull(),
    pickupAddress: text('pickup_address').notNull(),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    bookedByMembershipId: membershipRef('booked_by_membership_id').notNull(),
    bookedVia: lessonsBookedVia('booked_via').notNull(),
    cancelledAt: tstz('cancelled_at'),
    cancelledByMembershipId: membershipRef('cancelled_by_membership_id'),
    cancelReason: text('cancel_reason'),
    lateCancel: boolean('late_cancel').notNull().default(false),
    version: integer('version').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('lessons_period_idx').using('gist', t.period),
    index('lessons_student_idx').on(t.schoolId, t.studentId),
    index('lessons_vehicle_idx').on(t.schoolId, t.vehicleId),
  ],
);

export const waitingList = pgTable(
  'waiting_list',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    lessonTypeId: uuid('lesson_type_id')
      .notNull()
      .references(() => lessonTypes.id),
    preferredWindows: jsonb('preferred_windows').notNull(),
    area: text('area').notNull(),
    active: boolean('active').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('waiting_list_active_student_type_key')
      .on(t.schoolId, t.studentId, t.lessonTypeId)
      .where(sql`${t.active}`),
    index('waiting_list_lesson_type_idx').on(t.schoolId, t.lessonTypeId, t.active, t.createdAt),
  ],
);

export const slotOffersSource = pgEnum('slot_offers_source', ['cancellation', 'gap', 'manual']);
export const slotOffersStatus = pgEnum('slot_offers_status', [
  'open',
  'taken',
  'expired',
  'withdrawn',
]);

export const slotOffers = pgTable(
  'slot_offers',
  {
    id: id(),
    schoolId: schoolId(),
    instructorMembershipId: membershipRef('instructor_membership_id').notNull(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id),
    lessonTypeId: uuid('lesson_type_id')
      .notNull()
      .references(() => lessonTypes.id),
    period: tstzrange('period').notNull(),
    source: slotOffersSource('source').notNull(),
    offeredToStudentIds: uuid('offered_to_student_ids').array().notNull(),
    acceptedByStudentId: uuid('accepted_by_student_id').references(() => students.id),
    lessonId: uuid('lesson_id').references(() => lessons.id),
    expiresAt: tstz('expires_at').notNull(),
    status: slotOffersStatus('status').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('slot_offers_open_expiry_idx')
      .on(t.schoolId, t.expiresAt)
      .where(sql`${t.status} = 'open'`),
    index('slot_offers_offered_to_idx').using('gin', t.offeredToStudentIds),
  ],
);

export const syncOperationsStatus = pgEnum('sync_operations_status', ['applied', 'rejected']);

export const syncOperations = pgTable('sync_operations', {
  schoolId: schoolId(),
  opId: uuid('op_id').primaryKey(),
  membershipId: membershipRef('membership_id').notNull(),
  type: text('type').notNull(),
  status: syncOperationsStatus('status').notNull(),
  result: jsonb('result').notNull(),
  appliedAt: tstz('applied_at').notNull(),
  ...timestamps(),
});

export const changeFeedOp = pgEnum('change_feed_op', ['upsert', 'delete', 'revoke']);

export const changeFeed = pgTable(
  'change_feed',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    schoolId: schoolId(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    op: changeFeedOp('op').notNull(),
    audienceMembershipId: membershipRef('audience_membership_id'),
    at: tstz('at').notNull(),
    ...timestamps(),
  },
  (t) => [index('change_feed_audience_seq_idx').on(t.schoolId, t.audienceMembershipId, t.seq)],
);

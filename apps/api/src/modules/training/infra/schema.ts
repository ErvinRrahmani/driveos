import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { memberships, users } from '../../identity/infra/schema.js';
import { lessons } from '../../scheduling/infra/schema.js';
import { schoolId } from '../../school/infra/schema.js';

const studentRef = () =>
  uuid('student_id')
    .notNull()
    .references(() => students.id);

export const studentsStatus = pgEnum('students_status', ['active', 'archived', 'anonymized']);

export const students = pgTable(
  'students',
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid('user_id').references(() => users.id),
    fullName: text('full_name').notNull().default(''),
    dateOfBirth: date('date_of_birth').notNull(),
    licenceClass: text('licence_class').notNull(),
    examLanguage: text('exam_language').notNull(),
    testDate: date('test_date'),
    area: text('area'),
    pickupAddress: text('pickup_address'),
    pickupLat: doublePrecision('pickup_lat'),
    pickupLng: doublePrecision('pickup_lng'),
    status: studentsStatus('status').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('students_school_user_key')
      .on(t.schoolId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);

export const studentInstructors = pgTable(
  'student_instructors',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    instructorMembershipId: uuid('instructor_membership_id')
      .notNull()
      .references(() => memberships.id),
    isPrimary: boolean('is_primary').notNull(),
    assignedAt: tstz('assigned_at').notNull(),
    unassignedAt: tstz('unassigned_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('student_instructors_active_key')
      .on(t.studentId, t.instructorMembershipId)
      .where(sql`${t.unassignedAt} is null`),
    uniqueIndex('student_instructors_primary_key')
      .on(t.studentId)
      .where(sql`${t.isPrimary} and ${t.unassignedAt} is null`),
    index('student_instructors_instructor_idx')
      .on(t.instructorMembershipId)
      .where(sql`${t.unassignedAt} is null`),
  ],
);

export const guardianLinks = pgTable(
  'guardian_links',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => users.id),
    consentAt: tstz('consent_at'),
    consentTextVersion: text('consent_text_version'),
    revokedAt: tstz('revoked_at'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('guardian_links_active_key')
      .on(t.studentId, t.guardianUserId)
      .where(sql`${t.revokedAt} is null`),
    index('guardian_links_guardian_idx').on(t.guardianUserId),
  ],
);

export const enrolments = pgTable(
  'enrolments',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    courseName: text('course_name').notNull(),
    licenceClass: text('licence_class').notNull(),
    startedAt: tstz('started_at').notNull(),
    endedAt: tstz('ended_at'),
    ...timestamps(),
  },
  (t) => [index('enrolments_student_idx').on(t.studentId)],
);

export const syllabusItems = pgTable('syllabus_items', {
  id: id(),
  schoolId: schoolId(),
  licenceClass: text('licence_class').notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull(),
  ...timestamps(),
});

export const progressEntries = pgTable(
  'progress_entries',
  {
    id: id(),
    schoolId: schoolId(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    studentId: studentRef(),
    syllabusItemId: uuid('syllabus_item_id')
      .notNull()
      .references(() => syllabusItems.id),
    level: smallint('level').notNull(),
    note: text('note').notNull(),
    recordedByMembershipId: uuid('recorded_by_membership_id').references(() => memberships.id),
    version: integer('version').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('progress_entries_lesson_item_key').on(t.lessonId, t.studentId, t.syllabusItemId),
    index('progress_entries_student_idx').on(t.studentId),
  ],
);

export const privateNotes = pgTable(
  'private_notes',
  {
    id: id(),
    schoolId: schoolId(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    studentId: studentRef(),
    authorMembershipId: uuid('author_membership_id')
      .notNull()
      .references(() => memberships.id),
    body: text('body').notNull(),
    version: integer('version').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('private_notes_lesson_author_key').on(
      t.lessonId,
      t.studentId,
      t.authorMembershipId,
    ),
    index('private_notes_student_idx').on(t.studentId),
  ],
);

export const testAttemptsKind = pgEnum('test_attempts_kind', ['theory', 'practical']);
export const testAttemptsResult = pgEnum('test_attempts_result', ['passed', 'failed']);

export const testAttempts = pgTable(
  'test_attempts',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: studentRef(),
    kind: testAttemptsKind('kind').notNull(),
    takenOn: date('taken_on').notNull(),
    result: testAttemptsResult('result').notNull(),
    notes: text('notes').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    index('test_attempts_student_idx').on(t.studentId),
    index('test_attempts_taken_on_idx').on(t.schoolId, t.takenOn),
  ],
);

export const rmStudentList = pgTable('rm_student_list', {
  schoolId: schoolId(),
  studentId: uuid('student_id')
    .primaryKey()
    .references(() => students.id),
  fullName: text('full_name').notNull(),
  licenceClass: text('licence_class').notNull(),
  status: text('status').notNull(),
  primaryInstructorName: text('primary_instructor_name'),
  balanceMinutes: integer('balance_minutes').notNull(),
  nextLessonAt: tstz('next_lesson_at'),
  lastLessonAt: tstz('last_lesson_at'),
  progressPct: smallint('progress_pct').notNull(),
  ...timestamps(),
});

export const rmStudentLessons = pgTable(
  'rm_student_lessons',
  {
    schoolId: schoolId(),
    lessonId: uuid('lesson_id').primaryKey(),
    studentId: studentRef(),
    instructorMembershipId: uuid('instructor_membership_id').notNull(),
    startAt: tstz('start_at').notNull(),
    endAt: tstz('end_at').notNull(),
    status: text('status').notNull(),
    ...timestamps(),
  },
  (t) => [index('rm_student_lessons_student_idx').on(t.studentId, t.startAt)],
);

export const leadsStatus = pgEnum('leads_status', ['new', 'contacted', 'converted', 'lost']);
export const leadsSource = pgEnum('leads_source', ['page', 'manual']);

export const leads = pgTable(
  'leads',
  {
    id: id(),
    schoolId: schoolId(),
    status: leadsStatus('status').notNull().default('new'),
    source: leadsSource('source').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    licenceClass: text('licence_class').notNull(),
    message: text('message'),
    isMinor: boolean('is_minor').notNull(),
    guardianName: text('guardian_name'),
    guardianContact: text('guardian_contact'),
    consentTextVersion: text('consent_text_version').notNull(),
    consentedAt: tstz('consented_at').notNull(),
    note: text('note'),
    studentId: uuid('student_id').references(() => students.id),
    convertedAt: tstz('converted_at'),
    lostAt: tstz('lost_at'),
    lostReason: text('lost_reason'),
    requestIpHash: text('request_ip_hash'),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    check('leads_contact_check', sql`${t.phone} is not null or ${t.email} is not null`),
    check(
      'leads_guardian_check',
      sql`not ${t.isMinor} or (${t.guardianName} is not null and ${t.guardianContact} is not null)`,
    ),
    index('leads_status_created_idx').on(t.schoolId, t.status, t.createdAt.desc()),
    index('leads_email_idx').on(t.schoolId, sql`lower(${t.email})`),
    index('leads_phone_idx').on(t.schoolId, t.phone),
  ],
);

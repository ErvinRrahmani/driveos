import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface SchoolFixture {
  schoolId: string;
  branchId: string;
  ownerUserId: string;
  instructorIds: [string, string];
  studentIds: [string, string];
  vehicleIds: [string, string];
  lessonTypeId: string;
}

async function insert(client: pg.Client, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  await client.query(
    `insert into ${table} (${columns.join(', ')}) values (${placeholders.join(', ')})`,
    Object.values(row),
  );
}

async function membership(client: pg.Client, schoolId: string, roles: string[]) {
  const userId = randomUUID();
  await insert(client, 'users', { id: userId, full_name: `User ${userId}`, locale: 'en' });
  const membershipId = randomUUID();
  await insert(client, 'memberships', {
    id: membershipId,
    school_id: schoolId,
    user_id: userId,
    roles,
    status: 'active',
  });
  return { userId, membershipId };
}

async function student(client: pg.Client, schoolId: string) {
  const id = randomUUID();
  await insert(client, 'students', {
    id,
    school_id: schoolId,
    date_of_birth: '2005-04-01',
    licence_class: 'B',
    exam_language: 'en',
    status: 'active',
  });
  return id;
}

async function vehicle(client: pg.Client, schoolId: string, branchId: string) {
  const id = randomUUID();
  await insert(client, 'vehicles', {
    id,
    school_id: schoolId,
    branch_id: branchId,
    plate: id.slice(0, 8),
    make_model: 'Skoda Fabia',
    transmission: 'manual',
    licence_class: 'B',
    active: true,
  });
  return id;
}

export async function createSchoolFixture(client: pg.Client): Promise<SchoolFixture> {
  const schoolId = randomUUID();
  await insert(client, 'schools', {
    id: schoolId,
    name: 'Fixture School',
    legal_name: 'Fixture School Ltd',
    address: '1 Main St',
    country_code: 'GB',
    time_zone: 'Europe/London',
    currency: 'GBP',
    locale: 'en',
    status: 'active',
  });
  const branchId = randomUUID();
  await insert(client, 'branches', {
    id: branchId,
    school_id: schoolId,
    name: 'Main',
    address: '1 Main St',
    lat: 51.5,
    lng: -0.12,
  });
  const owner = await membership(client, schoolId, ['owner']);
  const first = await membership(client, schoolId, ['instructor']);
  const second = await membership(client, schoolId, ['instructor']);
  const lessonTypeId = randomUUID();
  await insert(client, 'lesson_types', {
    id: lessonTypeId,
    school_id: schoolId,
    name: 'Standard',
    kind: 'lesson',
    licence_class: 'B',
    minutes: 60,
    credit_minutes: 60,
    requires_vehicle: true,
    active: true,
  });
  return {
    schoolId,
    branchId,
    ownerUserId: owner.userId,
    instructorIds: [first.membershipId, second.membershipId],
    studentIds: [await student(client, schoolId), await student(client, schoolId)],
    vehicleIds: [
      await vehicle(client, schoolId, branchId),
      await vehicle(client, schoolId, branchId),
    ],
    lessonTypeId,
  };
}

export interface LessonInput {
  instructor: string;
  student: string;
  vehicle: string | null;
  period: string;
  status?: 'booked' | 'completed' | 'cancelled' | 'no_show';
}

export async function insertLesson(client: pg.Client, f: SchoolFixture, lesson: LessonInput) {
  const id = randomUUID();
  await insert(client, 'lessons', {
    id,
    school_id: f.schoolId,
    student_id: lesson.student,
    instructor_membership_id: lesson.instructor,
    vehicle_id: lesson.vehicle,
    lesson_type_id: f.lessonTypeId,
    credit_minutes: 60,
    period: lesson.period,
    status: lesson.status ?? 'booked',
    pickup_address: '1 Main St',
    pickup_lat: 51.5,
    pickup_lng: -0.12,
    booked_by_membership_id: f.instructorIds[0],
    booked_via: 'office',
    version: 1,
  });
  return id;
}

export async function insertRow(client: pg.Client, table: string, row: Record<string, unknown>) {
  const id = randomUUID();
  await insert(client, table, { id, ...row });
  return id;
}

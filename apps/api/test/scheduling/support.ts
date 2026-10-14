import { newId } from '../../src/kernel/db/columns.js';
import {
  availability,
  lessons,
  lessonTypes,
  slotOffers,
  waitingList,
} from '../../src/modules/scheduling/infra/schema.js';
import { vehicles } from '../../src/modules/school/infra/schema.js';
import { students } from '../../src/modules/training/infra/schema.js';
import { createBranch } from '../identity/support.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';

export async function insertLessonType(
  tenants: TestTenants,
  tenant: TestTenant,
  overrides: Partial<typeof lessonTypes.$inferInsert> = {},
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(lessonTypes).values({
      id,
      schoolId: tenant.schoolId,
      name: 'Standard lesson',
      kind: 'lesson',
      licenceClass: 'B',
      minutes: 60,
      creditMinutes: 60,
      requiresVehicle: false,
      active: true,
      ...overrides,
    }),
  );
  return id;
}

export async function insertStudent(
  tenants: TestTenants,
  tenant: TestTenant,
  fullName: string,
  userId: string | null = null,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(students).values({
      id,
      schoolId: tenant.schoolId,
      userId,
      fullName,
      dateOfBirth: '2000-01-01',
      licenceClass: 'B',
      examLanguage: 'en',
      status: 'active',
    }),
  );
  return id;
}

export async function insertVehicle(
  tenants: TestTenants,
  tenant: TestTenant,
  plate: string,
  overrides: Partial<typeof vehicles.$inferInsert> = {},
): Promise<string> {
  const branchId = await createBranch(tenants, tenant);
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(vehicles).values({
      id,
      schoolId: tenant.schoolId,
      branchId,
      plate,
      makeModel: 'VW Golf',
      transmission: 'manual',
      licenceClass: 'B',
      active: true,
      ...overrides,
    }),
  );
  return id;
}

export async function insertWeekdayAvailability(
  tenants: TestTenants,
  tenant: TestTenant,
  instructorMembershipId: string,
  startTime = '09:00',
  endTime = '17:00',
): Promise<void> {
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(availability).values(
      [1, 2, 3, 4, 5].map((weekday) => ({
        schoolId: tenant.schoolId,
        instructorMembershipId,
        weekday,
        startTime,
        endTime,
        validFrom: '2026-01-01',
      })),
    ),
  );
}

export interface LessonFixture {
  studentId: string;
  instructorMembershipId: string;
  lessonTypeId: string;
  start: string;
  minutes?: number;
  vehicleId?: string | null;
  status?: 'booked' | 'completed' | 'cancelled' | 'no_show';
}

export async function insertLesson(
  tenants: TestTenants,
  tenant: TestTenant,
  input: LessonFixture,
): Promise<string> {
  const id = newId();
  const start = new Date(input.start);
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(lessons).values({
      id,
      schoolId: tenant.schoolId,
      studentId: input.studentId,
      instructorMembershipId: input.instructorMembershipId,
      vehicleId: input.vehicleId ?? null,
      lessonTypeId: input.lessonTypeId,
      creditMinutes: 60,
      period: { start, end: new Date(start.getTime() + (input.minutes ?? 60) * 60_000) },
      status: input.status ?? 'booked',
      pickupAddress: 'Torstr. 1',
      pickupLat: 52.53,
      pickupLng: 13.4,
      bookedByMembershipId: tenant.ownerMembershipId,
      bookedVia: 'office',
      version: 1,
    }),
  );
  return id;
}

export interface WaitingListFixture {
  studentId: string;
  lessonTypeId: string;
  preferredWindows?: { weekday: number; start: string; end: string }[];
  area?: string;
  active?: boolean;
  createdAt?: Date;
}

export async function insertWaitingListEntry(
  tenants: TestTenants,
  tenant: TestTenant,
  input: WaitingListFixture,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(waitingList).values({
      id,
      schoolId: tenant.schoolId,
      studentId: input.studentId,
      lessonTypeId: input.lessonTypeId,
      preferredWindows: input.preferredWindows ?? [{ weekday: 2, start: '08:00', end: '18:00' }],
      area: input.area ?? 'Mitte',
      active: input.active ?? true,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    }),
  );
  return id;
}

export interface SlotOfferFixture {
  instructorMembershipId: string;
  lessonTypeId: string;
  start: string;
  minutes?: number;
  offeredToStudentIds: string[];
  expiresAt?: Date;
  status?: 'open' | 'taken' | 'expired' | 'withdrawn';
  vehicleId?: string | null;
}

export async function insertSlotOffer(
  tenants: TestTenants,
  tenant: TestTenant,
  input: SlotOfferFixture,
): Promise<string> {
  const id = newId();
  const start = new Date(input.start);
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(slotOffers).values({
      id,
      schoolId: tenant.schoolId,
      instructorMembershipId: input.instructorMembershipId,
      vehicleId: input.vehicleId ?? null,
      lessonTypeId: input.lessonTypeId,
      period: { start, end: new Date(start.getTime() + (input.minutes ?? 60) * 60_000) },
      source: 'manual',
      offeredToStudentIds: input.offeredToStudentIds,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 3_600_000),
      status: input.status ?? 'open',
    }),
  );
  return id;
}

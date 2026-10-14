import type { Principal } from '../../src/kernel/auth/principal.js';
import { newId } from '../../src/kernel/db/columns.js';
import { permissionGrants } from '../../src/modules/identity/infra/schema.js';
import { lessons, lessonTypes } from '../../src/modules/scheduling/infra/schema.js';
import {
  guardianLinks,
  studentInstructors,
  syllabusItems,
} from '../../src/modules/training/infra/schema.js';
import { createUser } from '../identity/support.js';
import { authHeadersFor, type TestTenant, type TestTenants } from '../support/tenants.js';

export interface Login {
  userId: string;
  membershipId: string;
  headers: Record<string, string>;
}

export async function createLogin(
  tenants: TestTenants,
  tenant: TestTenant,
  roles: string[],
  grants: string[] = [],
): Promise<Login> {
  const user = await createUser(tenants, { memberships: [{ tenant, roles }] });
  const membershipId = user.membershipIds[0] as string;
  if (grants.length > 0) {
    await tenants.asSchool(tenant, (tx) =>
      tx
        .insert(permissionGrants)
        .values(
          grants.map((permission) => ({ schoolId: tenant.schoolId, membershipId, permission })),
        ),
    );
  }
  return {
    userId: user.userId,
    membershipId,
    headers: authHeadersFor(tenant, { roles, membershipId, userId: user.userId }),
  };
}

export async function assignInstructor(
  tenants: TestTenants,
  tenant: TestTenant,
  studentId: string,
  instructorMembershipId: string,
  isPrimary = true,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(studentInstructors).values({
      id,
      schoolId: tenant.schoolId,
      studentId,
      instructorMembershipId,
      isPrimary,
      assignedAt: new Date(),
    }),
  );
  return id;
}

export async function linkGuardianRow(
  tenants: TestTenants,
  tenant: TestTenant,
  studentId: string,
  guardianUserId: string,
  consentAt: Date | null,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(guardianLinks).values({
      id,
      schoolId: tenant.schoolId,
      studentId,
      guardianUserId,
      consentAt,
      consentTextVersion: consentAt ? 'v1' : null,
    }),
  );
  return id;
}

export function dateYearsAgo(years: number, extraDays = 0, now = new Date()): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + extraDays),
  );
  return date.toISOString().slice(0, 10);
}

export const studentBody = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Selin Sommer',
  dateOfBirth: '2000-03-14',
  licenceClass: 'B',
  examLanguage: 'en',
  area: 'Mitte',
  ...overrides,
});

export function principalOf(tenant: TestTenant, login: Login, roles: string[]): Principal {
  return {
    userId: login.userId,
    schoolId: tenant.schoolId,
    membershipId: login.membershipId,
    roles,
    tokenType: 'access',
    sessionId: null,
  };
}

export async function createSyllabus(
  tenants: TestTenants,
  tenant: TestTenant,
  codes: readonly string[],
  licenceClass = 'B',
): Promise<string[]> {
  const ids = codes.map(() => newId());
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(syllabusItems).values(
      codes
        .map((code, index) => ({
          id: ids[index] as string,
          schoolId: tenant.schoolId,
          licenceClass,
          code,
          title: `Topic ${code}`,
          sortOrder: index + 1,
        }))
        .reverse(),
    ),
  );
  return ids;
}

export interface LessonRowInput {
  studentId: string;
  instructorMembershipId: string;
  start: Date;
  status?: 'booked' | 'completed' | 'cancelled' | 'no_show';
}

export async function createLessonRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: LessonRowInput,
): Promise<string> {
  const lessonTypeId = newId();
  const lessonId = newId();
  await tenants.asSchool(tenant, async (tx) => {
    await tx.insert(lessonTypes).values({
      id: lessonTypeId,
      schoolId: tenant.schoolId,
      name: 'Lesson',
      kind: 'lesson',
      licenceClass: 'B',
      minutes: 60,
      creditMinutes: 60,
      requiresVehicle: false,
      active: true,
    });
    await tx.insert(lessons).values({
      id: lessonId,
      schoolId: tenant.schoolId,
      studentId: input.studentId,
      instructorMembershipId: input.instructorMembershipId,
      lessonTypeId,
      creditMinutes: 60,
      period: { start: input.start, end: new Date(input.start.getTime() + 3_600_000) },
      status: input.status ?? 'completed',
      pickupAddress: '1 Test Street',
      pickupLat: 52.5,
      pickupLng: 13.4,
      bookedByMembershipId: tenant.ownerMembershipId,
      bookedVia: 'office',
      version: 1,
    });
  });
  return lessonId;
}

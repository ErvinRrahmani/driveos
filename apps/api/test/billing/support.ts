import { newId } from '../../src/kernel/db/columns.js';
import { payments, priceItems, refunds } from '../../src/modules/billing/infra/schema.js';
import { lessons, lessonTypes } from '../../src/modules/scheduling/infra/schema.js';
import { createStudent, createUser } from '../identity/support.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';
import { authHeadersFor } from '../support/tenants.js';

export interface StudentLogin {
  studentId: string;
  userId: string;
  membershipId: string;
  headers: Record<string, string>;
}

export async function createStudentLogin(
  tenants: TestTenants,
  tenant: TestTenant,
): Promise<StudentLogin> {
  const user = await createUser(tenants, { memberships: [{ tenant, roles: ['student'] }] });
  const membershipId = user.membershipIds[0] as string;
  const studentId = await createStudent(tenants, tenant, {
    dateOfBirth: '2000-01-01',
    userId: user.userId,
  });
  return {
    studentId,
    userId: user.userId,
    membershipId,
    headers: authHeadersFor(tenant, { roles: ['student'], membershipId, userId: user.userId }),
  };
}

export async function createStaffLogin(
  tenants: TestTenants,
  tenant: TestTenant,
  roles: string[],
): Promise<Record<string, string>> {
  const user = await createUser(tenants, { memberships: [{ tenant, roles }] });
  return authHeadersFor(tenant, {
    roles,
    membershipId: user.membershipIds[0] as string,
    userId: user.userId,
  });
}

let lessonSlot = 0;

export async function createLesson(
  tenants: TestTenants,
  tenant: TestTenant,
  studentId: string,
): Promise<string> {
  const lessonTypeId = newId();
  const lessonId = newId();
  lessonSlot += 1;
  const start = new Date(Date.UTC(2030, 0, 1) + lessonSlot * 2 * 3_600_000);
  const end = new Date(start.getTime() + 3_600_000);
  await tenants.asSchool(tenant, async (tx) => {
    await tx.insert(lessonTypes).values({
      id: lessonTypeId,
      schoolId: tenant.schoolId,
      name: 'Exam',
      kind: 'exam',
      licenceClass: 'B',
      minutes: 60,
      creditMinutes: 60,
      requiresVehicle: false,
      active: true,
    });
    await tx.insert(lessons).values({
      id: lessonId,
      schoolId: tenant.schoolId,
      studentId,
      instructorMembershipId: tenant.ownerMembershipId,
      lessonTypeId,
      creditMinutes: 60,
      period: { start, end },
      status: 'booked',
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

export async function createPriceItemRow(
  tenants: TestTenants,
  tenant: TestTenant,
  overrides: Partial<typeof priceItems.$inferInsert> = {},
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(priceItems).values({
      id,
      schoolId: tenant.schoolId,
      name: '10-lesson package',
      kind: 'package',
      creditMinutes: 600,
      entitlementKind: null,
      amountMinor: 60_000,
      currency: 'EUR',
      taxRateBp: 1900,
      active: true,
      sortOrder: 1,
      ...overrides,
    }),
  );
  return id;
}

export async function createPaymentRow(
  tenants: TestTenants,
  tenant: TestTenant,
  studentId: string,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(payments).values({
      id,
      schoolId: tenant.schoolId,
      studentId,
      method: 'cash',
      amountMinor: 60_000,
      currency: 'EUR',
      status: 'succeeded',
    }),
  );
  return id;
}

export async function createRefundRow(
  tenants: TestTenants,
  tenant: TestTenant,
  paymentId: string,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(refunds).values({
      id,
      schoolId: tenant.schoolId,
      paymentId,
      amountMinor: 1000,
      currency: 'EUR',
      minutesRemoved: 120,
      reason: 'test refund',
      status: 'succeeded',
    }),
  );
  return id;
}

const BIGINT_COLUMN = /(_minor|^number)$/;

export function numericRow<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      BIGINT_COLUMN.test(key) && typeof value === 'string' ? Number(value) : value,
    ]),
  ) as T;
}

export function single<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Expected exactly one row, got ${rows.length}`);
  }
  return row;
}

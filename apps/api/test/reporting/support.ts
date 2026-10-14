import { randomUUID } from 'node:crypto';
import type { MetricCounts } from '../../src/modules/reporting/domain/metrics.js';
import { newId } from '../../src/kernel/db/columns.js';
import {
  growthReports,
  rmInstructorAvailability,
  rmInstructorTimeOff,
  rmSchoolMetricsDaily,
  rmTestAttemptsDaily,
} from '../../src/modules/reporting/infra/schema.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';

const ZERO = {
  revenueInAppMinor: 0,
  revenueRecordedMinor: 0,
  refundsMinor: 0,
  lessonsCompleted: 0,
  lessonsDue: 0,
  lateCancellations: 0,
  lateCancelMinutesKept: 0,
  noShows: 0,
  upsellsSold: 0,
  upsellRevenueMinor: 0,
  packageMinutesSold: 0,
  slotsOffered: 0,
  slotsFilled: 0,
  slotFillMinutes: 0,
  instructorMinutesAvailable: 0,
  instructorMinutesBooked: 0,
};

export function seedDailyMetrics(
  tenants: TestTenants,
  tenant: TestTenant,
  day: string,
  counts: MetricCounts,
): Promise<unknown> {
  return tenants.asSchool(tenant, (tx) =>
    tx
      .insert(rmSchoolMetricsDaily)
      .values({ schoolId: tenant.schoolId, day, currency: 'EUR', ...ZERO, ...counts }),
  );
}

export interface ReportingFixture {
  instructorMembershipId: string;
  timeOffId: string;
}

/**
 * Weeks of 2026-10-12 and 2026-10-19 in a Berlin school: one instructor available 09:00–17:00
 * on weekdays from 2026-01-01, two hours off on 2026-10-14, plus daily metrics and test attempts.
 */
export async function seedReportingFixture(
  tenants: TestTenants,
  tenant: TestTenant,
): Promise<ReportingFixture> {
  const instructorMembershipId = randomUUID();
  const timeOffId = randomUUID();
  await seedDailyMetrics(tenants, tenant, '2026-10-12', {
    lessonsDue: 4,
    noShows: 1,
    lessonsCompleted: 3,
    revenueInAppMinor: 10_000,
    revenueRecordedMinor: 15_000,
    refundsMinor: 1_000,
    upsellsSold: 1,
    upsellRevenueMinor: 2_000,
    packageMinutesSold: 450,
    instructorMinutesBooked: 300,
    slotsOffered: 2,
    slotsFilled: 1,
    slotFillMinutes: 90,
  });
  await seedDailyMetrics(tenants, tenant, '2026-10-14', {
    lessonsDue: 2,
    noShows: 1,
    lessonsCompleted: 1,
    revenueInAppMinor: 5_000,
    revenueRecordedMinor: 5_000,
    instructorMinutesBooked: 120,
  });
  await seedDailyMetrics(tenants, tenant, '2026-10-19', {
    lessonsDue: 3,
    lessonsCompleted: 3,
    instructorMinutesBooked: 60,
  });
  await seedDailyMetrics(tenants, tenant, '2026-11-02', {
    lessonsDue: 50,
    noShows: 50,
    revenueInAppMinor: 99_999,
    revenueRecordedMinor: 99_999,
  });
  await tenants.asSchool(tenant, async (tx) => {
    await tx.insert(rmTestAttemptsDaily).values([
      { schoolId: tenant.schoolId, day: '2026-10-12', kind: 'theory', attempts: 3, passed: 2 },
      { schoolId: tenant.schoolId, day: '2026-10-19', kind: 'practical', attempts: 2, passed: 1 },
    ]);
    await tx.insert(rmInstructorAvailability).values({
      schoolId: tenant.schoolId,
      instructorMembershipId,
      version: 1,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      windows: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: '09:00',
        endTime: '17:00',
      })),
    });
    await tx.insert(rmInstructorTimeOff).values({
      schoolId: tenant.schoolId,
      timeOffId,
      instructorMembershipId,
      startAt: new Date('2026-10-14T07:00:00Z'),
      endAt: new Date('2026-10-14T09:00:00Z'),
    });
  });
  return { instructorMembershipId, timeOffId };
}

export async function seedGrowthReport(
  tenants: TestTenants,
  tenant: TestTenant,
  month: string,
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(growthReports).values({
      id,
      schoolId: tenant.schoolId,
      month: `${month}-01`,
      currency: 'EUR',
      revenueInAppMinor: 30_000,
      revenueRecordedMinor: 40_000,
      inappShareBp: 7500,
      lateCancellationsKept: 1,
      lateCancelMinutesKept: 45,
      noShowRateBp: 1000,
      noShowRatePrev3mBp: 1200,
      upsellsSold: 1,
      upsellRevenueMinor: 5_000,
      slotsFilled: 2,
      slotFillMinutes: 90,
      generatedAt: new Date(`${month}-28T01:00:00Z`),
    }),
  );
  return id;
}

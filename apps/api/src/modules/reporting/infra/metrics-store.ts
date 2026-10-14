import { Injectable } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AvailabilityLayer, TimeOffPeriod } from '../domain/availability.js';
import {
  type Contribution,
  METRIC_KEYS,
  type MetricCounts,
  type MetricKey,
} from '../domain/metrics.js';
import {
  rmInstructorAvailability,
  rmInstructorTimeOff,
  rmLeadStudents,
  rmMetricSources,
  rmSchoolMetricsDaily,
  rmTestAttemptsDaily,
} from './schema.js';

const COLUMNS: Record<MetricKey, PgColumn> = {
  revenueInAppMinor: rmSchoolMetricsDaily.revenueInAppMinor,
  revenueRecordedMinor: rmSchoolMetricsDaily.revenueRecordedMinor,
  refundsMinor: rmSchoolMetricsDaily.refundsMinor,
  lessonsCompleted: rmSchoolMetricsDaily.lessonsCompleted,
  lessonsDue: rmSchoolMetricsDaily.lessonsDue,
  lateCancellations: rmSchoolMetricsDaily.lateCancellations,
  lateCancelMinutesKept: rmSchoolMetricsDaily.lateCancelMinutesKept,
  noShows: rmSchoolMetricsDaily.noShows,
  upsellsSold: rmSchoolMetricsDaily.upsellsSold,
  upsellRevenueMinor: rmSchoolMetricsDaily.upsellRevenueMinor,
  packageMinutesSold: rmSchoolMetricsDaily.packageMinutesSold,
  slotsOffered: rmSchoolMetricsDaily.slotsOffered,
  slotsFilled: rmSchoolMetricsDaily.slotsFilled,
  slotFillMinutes: rmSchoolMetricsDaily.slotFillMinutes,
  instructorMinutesBooked: rmSchoolMetricsDaily.instructorMinutesBooked,
  leadsCaptured: rmSchoolMetricsDaily.leadsCaptured,
  leadsConverted: rmSchoolMetricsDaily.leadsConverted,
  leadRevenueMinor: rmSchoolMetricsDaily.leadRevenueMinor,
};

const ZERO_COUNTS = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<
  MetricKey,
  number
>;

const countsSchema = z.partialRecord(z.enum(METRIC_KEYS), z.number().int());

@Injectable()
export class MetricsStore {
  constructor(private readonly tenant: TenantContext) {}

  async add(schoolId: string, delta: Contribution, currency: string): Promise<void> {
    const keys = METRIC_KEYS.filter((key) => (delta.counts[key] ?? 0) !== 0);
    if (keys.length === 0) return;
    const set: Record<string, SQL> = { updatedAt: sql`now()` };
    for (const key of keys) {
      const column = COLUMNS[key];
      set[key] = sql`${column} + excluded.${sql.identifier(column.name)}`;
    }
    await this.tenant.tx
      .insert(rmSchoolMetricsDaily)
      .values({
        schoolId,
        day: delta.day,
        currency,
        instructorMinutesAvailable: 0,
        ...ZERO_COUNTS,
        ...delta.counts,
      })
      .onConflictDoUpdate({
        target: [rmSchoolMetricsDaily.schoolId, rmSchoolMetricsDaily.day],
        set,
      });
  }

  async replaceSource(
    schoolId: string,
    sourceType: string,
    sourceId: string,
    next: Contribution,
  ): Promise<Contribution | null> {
    const tx = this.tenant.tx;
    const [previous] = await tx
      .select({ day: rmMetricSources.day, counts: rmMetricSources.counts })
      .from(rmMetricSources)
      .where(
        and(eq(rmMetricSources.sourceType, sourceType), eq(rmMetricSources.sourceId, sourceId)),
      );
    await tx
      .insert(rmMetricSources)
      .values({ schoolId, sourceType, sourceId, day: next.day, counts: next.counts })
      .onConflictDoUpdate({
        target: [rmMetricSources.schoolId, rmMetricSources.sourceType, rmMetricSources.sourceId],
        set: { day: next.day, counts: next.counts, updatedAt: sql`now()` },
      });
    if (!previous) return null;
    return { day: previous.day, counts: countsSchema.parse(previous.counts) as MetricCounts };
  }

  async addTestAttempt(
    schoolId: string,
    day: string,
    kind: string,
    passed: boolean,
  ): Promise<void> {
    await this.tenant.tx
      .insert(rmTestAttemptsDaily)
      .values({ schoolId, day, kind, attempts: 1, passed: passed ? 1 : 0 })
      .onConflictDoUpdate({
        target: [rmTestAttemptsDaily.schoolId, rmTestAttemptsDaily.day, rmTestAttemptsDaily.kind],
        set: {
          attempts: sql`${rmTestAttemptsDaily.attempts} + excluded.attempts`,
          passed: sql`${rmTestAttemptsDaily.passed} + excluded.passed`,
          updatedAt: sql`now()`,
        },
      });
  }

  async addAvailabilityLayer(schoolId: string, layer: AvailabilityLayer): Promise<void> {
    await this.tenant.tx
      .insert(rmInstructorAvailability)
      .values({ schoolId, ...layer, windows: [...layer.windows] })
      .onConflictDoNothing();
  }

  async addLeadStudent(
    schoolId: string,
    studentId: string,
    leadId: string,
    day: string,
  ): Promise<void> {
    await this.tenant.tx
      .insert(rmLeadStudents)
      .values({ schoolId, studentId, leadId, convertedOn: day })
      .onConflictDoNothing();
  }

  async isLeadStudent(studentId: string): Promise<boolean> {
    const [row] = await this.tenant.tx
      .select({ studentId: rmLeadStudents.studentId })
      .from(rmLeadStudents)
      .where(eq(rmLeadStudents.studentId, studentId));
    return row !== undefined;
  }

  async addTimeOff(schoolId: string, timeOffId: string, period: TimeOffPeriod): Promise<void> {
    await this.tenant.tx
      .insert(rmInstructorTimeOff)
      .values({
        schoolId,
        timeOffId,
        instructorMembershipId: period.instructorMembershipId,
        startAt: period.start,
        endAt: period.end,
      })
      .onConflictDoNothing();
  }
}

import { Injectable } from '@nestjs/common';
import { and, asc, gt, gte, isNull, lt, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AvailabilityLayer, TimeOffPeriod } from '../domain/availability.js';
import { addDays } from '../domain/buckets.js';
import {
  rmInstructorAvailability,
  rmInstructorTimeOff,
  rmSchoolMetricsDaily,
  rmTestAttemptsDaily,
} from './schema.js';

export type DailyMetricsRow = typeof rmSchoolMetricsDaily.$inferSelect;

export interface TestAttemptsRow {
  day: string;
  kind: string;
  attempts: number;
  passed: number;
}

const windowsSchema = z.array(
  z.object({ weekday: z.number().int(), startTime: z.string(), endTime: z.string() }),
);

const DAY_MS = 86_400_000;

@Injectable()
export class ReportRows {
  constructor(private readonly tenant: TenantContext) {}

  daily(from: string, to: string): Promise<DailyMetricsRow[]> {
    return this.tenant.tx
      .select()
      .from(rmSchoolMetricsDaily)
      .where(and(gte(rmSchoolMetricsDaily.day, from), lte(rmSchoolMetricsDaily.day, to)))
      .orderBy(asc(rmSchoolMetricsDaily.day));
  }

  testAttempts(from: string, to: string): Promise<TestAttemptsRow[]> {
    return this.tenant.tx
      .select({
        day: rmTestAttemptsDaily.day,
        kind: rmTestAttemptsDaily.kind,
        attempts: rmTestAttemptsDaily.attempts,
        passed: rmTestAttemptsDaily.passed,
      })
      .from(rmTestAttemptsDaily)
      .where(and(gte(rmTestAttemptsDaily.day, from), lte(rmTestAttemptsDaily.day, to)));
  }

  async availabilityLayers(from: string, to: string): Promise<AvailabilityLayer[]> {
    const rows = await this.tenant.tx
      .select()
      .from(rmInstructorAvailability)
      .where(
        and(
          lte(rmInstructorAvailability.effectiveFrom, to),
          or(
            isNull(rmInstructorAvailability.effectiveTo),
            gte(rmInstructorAvailability.effectiveTo, from),
          ),
        ),
      );
    return rows.map((row) => ({
      instructorMembershipId: row.instructorMembershipId,
      version: row.version,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      windows: windowsSchema.parse(row.windows),
    }));
  }

  async timeOff(from: string, to: string): Promise<TimeOffPeriod[]> {
    const after = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS);
    const before = new Date(Date.parse(`${addDays(to, 2)}T00:00:00Z`));
    const rows = await this.tenant.tx
      .select()
      .from(rmInstructorTimeOff)
      .where(and(gt(rmInstructorTimeOff.endAt, after), lt(rmInstructorTimeOff.startAt, before)));
    return rows.map((row) => ({
      instructorMembershipId: row.instructorMembershipId,
      start: row.startAt,
      end: row.endAt,
    }));
  }
}

import type { AvailabilityResponse, AvailabilityWindow, TimeOff } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { InstructorPeriod, WeeklyRule } from '../domain/availability.js';
import type { Period } from '../domain/period.js';
import { availability, timeOff } from './schema.js';

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

type AvailabilityRow = typeof availability.$inferSelect;

function toWindow(row: AvailabilityRow): AvailabilityWindow {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: hhmm(row.startTime),
    endTime: hhmm(row.endTime),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

function toRule(row: AvailabilityRow): WeeklyRule {
  return {
    instructorMembershipId: row.instructorMembershipId,
    weekday: row.weekday,
    startTime: hhmm(row.startTime),
    endTime: hhmm(row.endTime),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

const overlapsRange = (range: Period) =>
  sql`${timeOff.period} && tstzrange(${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz, '[)')`;

@Injectable()
export class AvailabilityRecords {
  constructor(private readonly tenant: TenantContext) {}

  async response(
    instructorMembershipId: string,
    today: string,
    now: Date,
  ): Promise<AvailabilityResponse> {
    const rows = await this.tenant.tx
      .select()
      .from(availability)
      .where(
        and(
          eq(availability.instructorMembershipId, instructorMembershipId),
          or(isNull(availability.validTo), sql`${availability.validTo} >= ${today}`),
        ),
      )
      .orderBy(asc(availability.validFrom), asc(availability.weekday), asc(availability.startTime));
    const offs = await this.tenant.tx
      .select()
      .from(timeOff)
      .where(
        and(
          eq(timeOff.instructorMembershipId, instructorMembershipId),
          sql`upper(${timeOff.period}) > ${now.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(sql`lower(${timeOff.period})`);
    return {
      instructorMembershipId,
      items: rows.map(toWindow),
      timeOff: offs.map((row): TimeOff => ({
        id: row.id,
        start: row.period.start.toISOString(),
        end: row.period.end.toISOString(),
        reason: row.reason,
      })),
    };
  }

  async rules(
    instructorIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<WeeklyRule[]> {
    if (instructorIds.length === 0) return [];
    const rows = await this.tenant.tx
      .select()
      .from(availability)
      .where(
        and(
          inArray(availability.instructorMembershipId, [...instructorIds]),
          sql`${availability.validFrom} <= ${toDate}`,
          or(isNull(availability.validTo), sql`${availability.validTo} >= ${fromDate}`),
        ),
      );
    return rows.map(toRule);
  }

  async timeOff(
    instructorIds: readonly string[],
    range: Period,
  ): Promise<(InstructorPeriod & { id: string })[]> {
    if (instructorIds.length === 0) return [];
    const rows = await this.tenant.tx
      .select()
      .from(timeOff)
      .where(and(inArray(timeOff.instructorMembershipId, [...instructorIds]), overlapsRange(range)))
      .orderBy(sql`lower(${timeOff.period})`);
    return rows.map((row) => ({
      id: row.id,
      instructorMembershipId: row.instructorMembershipId,
      start: row.period.start,
      end: row.period.end,
    }));
  }

  async instructorsWithAvailability(fromDate: string, toDate: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ id: availability.instructorMembershipId })
      .from(availability)
      .where(
        and(
          sql`${availability.validFrom} <= ${toDate}`,
          or(isNull(availability.validTo), sql`${availability.validTo} >= ${fromDate}`),
        ),
      );
    return rows.map((row) => row.id);
  }
}

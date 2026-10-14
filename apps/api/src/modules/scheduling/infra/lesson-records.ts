import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gte,
  getTableColumns,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { Period } from '../domain/period.js';
import { lessons, lessonTypes } from './schema.js';

export const BLOCKING_STATUSES = ['booked', 'completed'] as const;

export type LessonRow = typeof lessons.$inferSelect;
export type CalendarRow = LessonRow & { lessonTypeName: string; lessonTypeKind: 'lesson' | 'exam' };

export interface LessonRef {
  id: string;
  instructorMembershipId: string;
}

export interface LessonScope {
  instructorIds: readonly string[];
  studentIds: readonly string[];
}

export interface CalendarPageFilter {
  range: Period;
  scope: 'all' | LessonScope;
  instructorId?: string;
  vehicleId?: string;
  studentId?: string;
  after?: { start: Date; id: string };
  limit: number;
}

export function periodOverlaps(range: Period): SQL {
  return sql`${lessons.period} && tstzrange(${range.start.toISOString()}::timestamptz, ${range.end.toISOString()}::timestamptz, '[)')`;
}

function scopeCondition(scope: LessonScope): SQL | undefined {
  const parts: SQL[] = [];
  if (scope.instructorIds.length > 0) {
    parts.push(inArray(lessons.instructorMembershipId, [...scope.instructorIds]));
  }
  if (scope.studentIds.length > 0) parts.push(inArray(lessons.studentId, [...scope.studentIds]));
  return or(...parts);
}

@Injectable()
export class LessonRecords {
  constructor(private readonly tenant: TenantContext) {}

  async byId(id: string): Promise<CalendarRow | null> {
    const [row] = await this.tenant.tx
      .select({
        ...getTableColumns(lessons),
        lessonTypeName: lessonTypes.name,
        lessonTypeKind: lessonTypes.kind,
      })
      .from(lessons)
      .innerJoin(lessonTypes, eq(lessonTypes.id, lessons.lessonTypeId))
      .where(eq(lessons.id, id));
    return row ?? null;
  }

  async byIds(ids: readonly string[]): Promise<CalendarRow[]> {
    if (ids.length === 0) return [];
    return this.tenant.tx
      .select({
        ...getTableColumns(lessons),
        lessonTypeName: lessonTypes.name,
        lessonTypeKind: lessonTypes.kind,
      })
      .from(lessons)
      .innerJoin(lessonTypes, eq(lessonTypes.id, lessons.lessonTypeId))
      .where(inArray(lessons.id, [...new Set(ids)]));
  }

  async refsOfStudent(
    studentId: string,
    statuses?: readonly LessonRow['status'][],
  ): Promise<LessonRef[]> {
    return this.tenant.tx
      .select({ id: lessons.id, instructorMembershipId: lessons.instructorMembershipId })
      .from(lessons)
      .where(
        and(
          eq(lessons.studentId, studentId),
          statuses ? inArray(lessons.status, [...statuses]) : undefined,
        ),
      )
      .orderBy(sql`lower(${lessons.period})`, asc(lessons.id));
  }

  async instructorsOf(lessonIds: readonly string[]): Promise<Map<string, string>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await this.tenant.tx
      .select({ id: lessons.id, instructorMembershipId: lessons.instructorMembershipId })
      .from(lessons)
      .where(inArray(lessons.id, [...new Set(lessonIds)]));
    return new Map(rows.map((row) => [row.id, row.instructorMembershipId]));
  }

  async studentIdsWithLessons(instructorMembershipId: string, since: Date): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ studentId: lessons.studentId })
      .from(lessons)
      .where(
        and(
          eq(lessons.instructorMembershipId, instructorMembershipId),
          ne(lessons.status, 'cancelled'),
          gte(sql`lower(${lessons.period})`, since.toISOString()),
        ),
      );
    return rows.map((row) => row.studentId);
  }

  async completedCount(studentId: string): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ total: count() })
      .from(lessons)
      .where(and(eq(lessons.studentId, studentId), eq(lessons.status, 'completed')));
    return row?.total ?? 0;
  }

  async calendarPage(filter: CalendarPageFilter): Promise<CalendarRow[]> {
    const scoped = filter.scope === 'all' ? undefined : scopeCondition(filter.scope);
    if (filter.scope !== 'all' && !scoped) return [];
    return this.tenant.tx
      .select({
        ...getTableColumns(lessons),
        lessonTypeName: lessonTypes.name,
        lessonTypeKind: lessonTypes.kind,
      })
      .from(lessons)
      .innerJoin(lessonTypes, eq(lessonTypes.id, lessons.lessonTypeId))
      .where(
        and(
          periodOverlaps(filter.range),
          scoped,
          filter.instructorId ? eq(lessons.instructorMembershipId, filter.instructorId) : undefined,
          filter.vehicleId ? eq(lessons.vehicleId, filter.vehicleId) : undefined,
          filter.studentId ? eq(lessons.studentId, filter.studentId) : undefined,
          filter.after
            ? sql`(lower(${lessons.period}), ${lessons.id}) > (${filter.after.start.toISOString()}::timestamptz, ${filter.after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(sql`lower(${lessons.period})`, asc(lessons.id))
      .limit(filter.limit + 1);
  }

  async adjacentStudentIds(
    instructorMembershipId: string,
    period: Period,
    day: Period,
  ): Promise<string[]> {
    const neighbour = (before: boolean) =>
      this.tenant.tx
        .select({ studentId: lessons.studentId })
        .from(lessons)
        .where(
          and(
            eq(lessons.instructorMembershipId, instructorMembershipId),
            inArray(lessons.status, [...BLOCKING_STATUSES]),
            before
              ? sql`upper(${lessons.period}) <= ${period.start.toISOString()}::timestamptz and lower(${lessons.period}) >= ${day.start.toISOString()}::timestamptz`
              : sql`lower(${lessons.period}) >= ${period.end.toISOString()}::timestamptz and lower(${lessons.period}) < ${day.end.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(before ? sql`upper(${lessons.period}) desc` : sql`lower(${lessons.period})`)
        .limit(1);
    const [previous] = await neighbour(true);
    const [next] = await neighbour(false);
    return [previous?.studentId, next?.studentId].filter((id): id is string => id !== undefined);
  }

  busyByInstructor(
    ids: readonly string[],
    range: Period,
    excludeLessonId?: string,
  ): Promise<Map<string, Period[]>> {
    return this.busy('instructor', ids, range, excludeLessonId);
  }

  busyByVehicle(ids: readonly string[], range: Period): Promise<Map<string, Period[]>> {
    return this.busy('vehicle', ids, range);
  }

  private async busy(
    by: 'instructor' | 'vehicle',
    ids: readonly string[],
    range: Period,
    excludeLessonId?: string,
  ): Promise<Map<string, Period[]>> {
    const busy = new Map<string, Period[]>();
    if (ids.length === 0) return busy;
    const column = by === 'instructor' ? lessons.instructorMembershipId : lessons.vehicleId;
    const rows = await this.tenant.tx
      .select({ key: column, period: lessons.period })
      .from(lessons)
      .where(
        and(
          inArray(column, [...ids]),
          inArray(lessons.status, [...BLOCKING_STATUSES]),
          periodOverlaps(range),
          excludeLessonId ? ne(lessons.id, excludeLessonId) : undefined,
        ),
      );
    for (const row of rows) {
      if (!row.key) continue;
      busy.set(row.key, [...(busy.get(row.key) ?? []), row.period]);
    }
    return busy;
  }
}

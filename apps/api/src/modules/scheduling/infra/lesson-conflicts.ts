import { Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { t } from '../../../kernel/i18n/i18n.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { findPgError, PG_EXCLUSION_VIOLATION } from '../../../kernel/http/pg-error.js';
import { type Transaction, TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { Period } from '../domain/period.js';
import { BLOCKING_STATUSES, periodOverlaps } from './lesson-records.js';
import { lessons } from './schema.js';

const KEY_BY_CONSTRAINT = {
  lessons_instructor_no_overlap: 'instructorMembershipId',
  lessons_vehicle_no_overlap: 'vehicleId',
  lessons_student_no_overlap: 'studentId',
} as const;

type ConflictKey = (typeof KEY_BY_CONSTRAINT)[keyof typeof KEY_BY_CONSTRAINT];

export interface LessonKeys {
  studentId: string;
  instructorMembershipId: string;
  vehicleId: string | null;
}

export interface LessonConflictDetails {
  start: string;
  end: string;
  lessonId?: string;
}

function conflictKey(error: unknown): ConflictKey | undefined {
  const pgError = findPgError(error);
  if (pgError?.code !== PG_EXCLUSION_VIOLATION || !pgError.constraint) return undefined;
  return (KEY_BY_CONSTRAINT as Readonly<Record<string, ConflictKey>>)[pgError.constraint];
}

@Injectable()
export class LessonConflicts {
  constructor(private readonly tenant: TenantContext) {}

  async guard<T>(
    keys: LessonKeys,
    period: Period,
    write: (tx: Transaction) => Promise<T>,
    excludeLessonId?: string,
  ): Promise<T> {
    try {
      return await this.tenant.tx.transaction((savepoint) => write(savepoint));
    } catch (error) {
      const key = conflictKey(error);
      if (!key) throw error;
      const details = await this.conflicting(key, keys, period, excludeLessonId);
      throw new ConflictError('lesson_conflict', t('errors.lesson_conflict'), details);
    }
  }

  private async conflicting(
    key: ConflictKey,
    keys: LessonKeys,
    period: Period,
    excludeLessonId: string | undefined,
  ): Promise<LessonConflictDetails> {
    const value = keys[key];
    const [row] = value
      ? await this.tenant.tx
          .select({ id: lessons.id, period: lessons.period })
          .from(lessons)
          .where(
            and(
              eq(lessons[key], value),
              inArray(lessons.status, [...BLOCKING_STATUSES]),
              periodOverlaps(period),
              excludeLessonId ? ne(lessons.id, excludeLessonId) : undefined,
            ),
          )
          .orderBy(sql`lower(${lessons.period})`)
          .limit(1)
      : [];
    const found = row?.period ?? period;
    return {
      start: found.start.toISOString(),
      end: found.end.toISOString(),
      ...(row ? { lessonId: row.id } : {}),
    };
  }
}

import { preferredWindowSchema } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { newId } from '../../../kernel/db/columns.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { findPgError, PG_UNIQUE_VIOLATION } from '../../../kernel/http/pg-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { PreferredWindow, WaitingListCandidate } from '../domain/slot-offers.js';
import { waitingList } from './schema.js';
import { schoolIdOf } from './tenant.js';

const windowsSchema = z.array(preferredWindowSchema);

export type WaitingListRow = typeof waitingList.$inferSelect;

export interface WaitingListEntryRecord extends Omit<WaitingListRow, 'preferredWindows'> {
  preferredWindows: PreferredWindow[];
}

export interface NewWaitingListEntry {
  studentId: string;
  lessonTypeId: string;
  preferredWindows: readonly PreferredWindow[];
  area: string;
}

export interface WaitingListPageFilter {
  studentIds: 'all' | readonly string[];
  studentId?: string;
  lessonTypeId?: string;
  active?: boolean;
  after?: string;
  limit: number;
}

function toRecord(row: WaitingListRow): WaitingListEntryRecord {
  return { ...row, preferredWindows: windowsSchema.parse(row.preferredWindows) };
}

@Injectable()
export class WaitingListRecords {
  constructor(private readonly tenant: TenantContext) {}

  async insert(entry: NewWaitingListEntry): Promise<WaitingListEntryRecord> {
    try {
      const [row] = await this.tenant.tx.transaction((savepoint) =>
        savepoint
          .insert(waitingList)
          .values({
            id: newId(),
            schoolId: schoolIdOf(this.tenant),
            studentId: entry.studentId,
            lessonTypeId: entry.lessonTypeId,
            preferredWindows: entry.preferredWindows,
            area: entry.area,
            active: true,
          })
          .returning(),
      );
      if (!row) throw new Error('Waiting-list insert returned no row');
      return toRecord(row);
    } catch (error) {
      if (findPgError(error)?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('already_on_waiting_list', t('errors.already_on_waiting_list'));
      }
      throw error;
    }
  }

  async find(id: string): Promise<WaitingListEntryRecord | null> {
    const [row] = await this.tenant.tx.select().from(waitingList).where(eq(waitingList.id, id));
    return row ? toRecord(row) : null;
  }

  async deactivate(id: string): Promise<void> {
    await this.tenant.tx.update(waitingList).set({ active: false }).where(eq(waitingList.id, id));
  }

  async page(filter: WaitingListPageFilter): Promise<WaitingListEntryRecord[]> {
    if (filter.studentIds !== 'all' && filter.studentIds.length === 0) return [];
    const rows = await this.tenant.tx
      .select()
      .from(waitingList)
      .where(
        and(
          filter.studentIds === 'all'
            ? undefined
            : inArray(waitingList.studentId, [...filter.studentIds]),
          filter.studentId ? eq(waitingList.studentId, filter.studentId) : undefined,
          filter.lessonTypeId ? eq(waitingList.lessonTypeId, filter.lessonTypeId) : undefined,
          filter.active === undefined ? undefined : eq(waitingList.active, filter.active),
          filter.after ? gt(waitingList.id, filter.after) : undefined,
        ),
      )
      .orderBy(asc(waitingList.id))
      .limit(filter.limit + 1);
    return rows.map(toRecord);
  }

  async activeFor(lessonTypeId: string): Promise<WaitingListCandidate[]> {
    const rows = await this.tenant.tx
      .select()
      .from(waitingList)
      .where(and(eq(waitingList.lessonTypeId, lessonTypeId), eq(waitingList.active, true)))
      .orderBy(asc(waitingList.createdAt), asc(waitingList.id));
    return rows.map((row) => {
      const record = toRecord(row);
      return {
        id: record.id,
        studentId: record.studentId,
        lessonTypeId: record.lessonTypeId,
        preferredWindows: record.preferredWindows,
        createdAt: record.createdAt,
      };
    });
  }
}

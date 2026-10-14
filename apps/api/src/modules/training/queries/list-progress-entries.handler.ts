import type { SyncProgressEntry } from '@driveos/shared';
import { and, asc, inArray } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { progressEntries } from '../infra/schema.js';
import { ListProgressEntriesQuery } from './list-progress-entries.query.js';

@QueryHandler(ListProgressEntriesQuery)
export class ListProgressEntriesHandler implements IQueryHandler<
  ListProgressEntriesQuery,
  SyncProgressEntry[]
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ filter }: ListProgressEntriesQuery): Promise<SyncProgressEntry[]> {
    const { ids, studentIds } = filter;
    if (ids?.length === 0 || studentIds?.length === 0) return [];
    return this.tenant.tx
      .select({
        id: progressEntries.id,
        lessonId: progressEntries.lessonId,
        studentId: progressEntries.studentId,
        syllabusItemId: progressEntries.syllabusItemId,
        level: progressEntries.level,
        note: progressEntries.note,
        version: progressEntries.version,
      })
      .from(progressEntries)
      .where(
        and(
          ids ? inArray(progressEntries.id, [...new Set(ids)]) : undefined,
          studentIds ? inArray(progressEntries.studentId, [...new Set(studentIds)]) : undefined,
        ),
      )
      .orderBy(asc(progressEntries.id));
  }
}

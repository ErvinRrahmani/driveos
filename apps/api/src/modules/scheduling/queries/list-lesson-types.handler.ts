import type { LessonTypeListResponse } from '@driveos/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toLessonType } from '../infra/lesson-type-records.js';
import { lessonTypes } from '../infra/schema.js';
import { ListLessonTypesQuery } from './list-lesson-types.query.js';

@QueryHandler(ListLessonTypesQuery)
export class ListLessonTypesHandler implements IQueryHandler<
  ListLessonTypesQuery,
  LessonTypeListResponse
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListLessonTypesQuery): Promise<LessonTypeListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(
        and(
          cursor ? gt(lessonTypes.id, cursor) : undefined,
          params.active ? eq(lessonTypes.active, params.active === 'true') : undefined,
        ),
      )
      .orderBy(asc(lessonTypes.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toLessonType), params.limit, (type) => type.id);
  }
}

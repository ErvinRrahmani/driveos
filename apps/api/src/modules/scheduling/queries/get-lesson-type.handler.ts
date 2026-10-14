import type { LessonType } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toLessonType } from '../infra/lesson-type-records.js';
import { lessonTypes } from '../infra/schema.js';
import { GetLessonTypeQuery } from './get-lesson-type.query.js';

@QueryHandler(GetLessonTypeQuery)
export class GetLessonTypeHandler implements IQueryHandler<GetLessonTypeQuery, LessonType | null> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ lessonTypeId }: GetLessonTypeQuery): Promise<LessonType | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(eq(lessonTypes.id, lessonTypeId));
    return row ? toLessonType(row) : null;
  }
}

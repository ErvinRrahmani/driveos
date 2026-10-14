import type { LessonResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { LessonViews } from '../infra/lesson-views.js';
import { GetLessonQuery } from './get-lesson.query.js';

@QueryHandler(GetLessonQuery)
export class GetLessonHandler implements IQueryHandler<GetLessonQuery, LessonResponse | null> {
  constructor(
    private readonly records: LessonRecords,
    private readonly views: LessonViews,
  ) {}

  async execute({ lessonId }: GetLessonQuery): Promise<LessonResponse | null> {
    const row = await this.records.byId(lessonId);
    if (!row) return null;
    const [view] = await this.views.toResponses([row]);
    return view ?? null;
  }
}

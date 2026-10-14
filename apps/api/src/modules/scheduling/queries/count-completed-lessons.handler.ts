import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { CountCompletedLessonsQuery } from './count-completed-lessons.query.js';

@QueryHandler(CountCompletedLessonsQuery)
export class CountCompletedLessonsHandler implements IQueryHandler<
  CountCompletedLessonsQuery,
  number
> {
  constructor(private readonly records: LessonRecords) {}

  execute({ studentId }: CountCompletedLessonsQuery): Promise<number> {
    return this.records.completedCount(studentId);
  }
}

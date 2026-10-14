import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { HasCompletedLessonsQuery } from './has-completed-lessons.query.js';

@QueryHandler(HasCompletedLessonsQuery)
export class HasCompletedLessonsHandler implements IQueryHandler<
  HasCompletedLessonsQuery,
  boolean
> {
  constructor(private readonly records: LessonRecords) {}

  async execute({ studentId }: HasCompletedLessonsQuery): Promise<boolean> {
    return (await this.records.completedCount(studentId)) > 0;
  }
}

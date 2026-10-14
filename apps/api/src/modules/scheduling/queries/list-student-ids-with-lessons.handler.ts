import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { ListStudentIdsWithLessonsQuery } from './list-student-ids-with-lessons.query.js';

@QueryHandler(ListStudentIdsWithLessonsQuery)
export class ListStudentIdsWithLessonsHandler implements IQueryHandler<
  ListStudentIdsWithLessonsQuery,
  string[]
> {
  constructor(private readonly records: LessonRecords) {}

  execute({ instructorMembershipId, since }: ListStudentIdsWithLessonsQuery): Promise<string[]> {
    return this.records.studentIdsWithLessons(instructorMembershipId, since);
  }
}

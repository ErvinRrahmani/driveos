import { Query } from '../../../kernel/cqrs/index.js';

export class ListStudentIdsWithLessonsQuery extends Query<string[]> {
  constructor(
    readonly instructorMembershipId: string,
    readonly since: Date,
  ) {
    super();
  }
}

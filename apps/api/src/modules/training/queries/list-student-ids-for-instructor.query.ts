import { Query } from '../../../kernel/cqrs/index.js';

export class ListStudentIdsForInstructorQuery extends Query<string[]> {
  constructor(readonly instructorMembershipId: string) {
    super();
  }
}

import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { Relations } from '../infra/relations.js';
import { ListStudentIdsForInstructorQuery } from './list-student-ids-for-instructor.query.js';

@QueryHandler(ListStudentIdsForInstructorQuery)
export class ListStudentIdsForInstructorHandler implements IQueryHandler<
  ListStudentIdsForInstructorQuery,
  string[]
> {
  constructor(private readonly relations: Relations) {}

  execute({ instructorMembershipId }: ListStudentIdsForInstructorQuery): Promise<string[]> {
    return this.relations.assignedTo(instructorMembershipId);
  }
}

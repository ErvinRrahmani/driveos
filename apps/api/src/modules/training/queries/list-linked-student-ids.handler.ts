import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { Relations } from '../infra/relations.js';
import { ListLinkedStudentIdsQuery } from './list-linked-student-ids.query.js';

@QueryHandler(ListLinkedStudentIdsQuery)
export class ListLinkedStudentIdsHandler implements IQueryHandler<
  ListLinkedStudentIdsQuery,
  string[]
> {
  constructor(private readonly relations: Relations) {}

  execute({ guardianUserId }: ListLinkedStudentIdsQuery): Promise<string[]> {
    return this.relations.consentedFor(guardianUserId);
  }
}

import { Query } from '../../../kernel/cqrs/index.js';

export class ListLinkedStudentIdsQuery extends Query<string[]> {
  constructor(readonly guardianUserId: string) {
    super();
  }
}

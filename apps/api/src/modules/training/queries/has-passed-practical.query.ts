import { Query } from '../../../kernel/cqrs/index.js';

export class HasPassedPracticalQuery extends Query<boolean> {
  constructor(readonly studentId: string) {
    super();
  }
}

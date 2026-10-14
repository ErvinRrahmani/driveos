import { Query } from '../../../kernel/cqrs/index.js';

export class HasCompletedLessonsQuery extends Query<boolean> {
  constructor(readonly studentId: string) {
    super();
  }
}

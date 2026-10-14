import { Query } from '../../../kernel/cqrs/index.js';

export class CountCompletedLessonsQuery extends Query<number> {
  constructor(readonly studentId: string) {
    super();
  }
}

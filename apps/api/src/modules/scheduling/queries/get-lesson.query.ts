import type { LessonResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetLessonQuery extends Query<LessonResponse | null> {
  constructor(readonly lessonId: string) {
    super();
  }
}

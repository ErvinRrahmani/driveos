import type { LessonType } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetLessonTypeQuery extends Query<LessonType | null> {
  constructor(readonly lessonTypeId: string) {
    super();
  }
}

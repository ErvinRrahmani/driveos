import type {
  LessonTypeListResponse,
  ListLessonTypesQuery as ListLessonTypesParams,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListLessonTypesQuery extends Query<LessonTypeListResponse> {
  constructor(readonly params: ListLessonTypesParams) {
    super();
  }
}

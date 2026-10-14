import type { ListReviewsQuery as ListReviewsParams, ReviewListResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

/** The current school's reviews, newest first, optionally by status (moderation screen). */
export class ListReviewsQuery extends Query<ReviewListResponse> {
  constructor(readonly params: ListReviewsParams) {
    super();
  }
}

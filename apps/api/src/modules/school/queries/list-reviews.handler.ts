import type { ReviewListResponse } from '@driveos/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toReview } from '../infra/review-records.js';
import { schoolReviews } from '../infra/schema.js';
import { ListReviewsQuery } from './list-reviews.query.js';

@QueryHandler(ListReviewsQuery)
export class ListReviewsHandler implements IQueryHandler<ListReviewsQuery, ReviewListResponse> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListReviewsQuery): Promise<ReviewListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(schoolReviews)
      .where(
        and(
          cursor ? lt(schoolReviews.id, cursor) : undefined,
          params.status ? eq(schoolReviews.status, params.status) : undefined,
        ),
      )
      .orderBy(desc(schoolReviews.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toReview), params.limit, (review) => review.id);
  }
}

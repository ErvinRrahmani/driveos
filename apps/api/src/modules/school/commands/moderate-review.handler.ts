import { ReviewModerated } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { REVIEW_AGGREGATE, ReviewRecords } from '../infra/review-records.js';
import { schoolReviews } from '../infra/schema.js';
import { ModerateReviewCommand } from './moderate-review.command.js';

@CommandHandler(ModerateReviewCommand)
export class ModerateReviewHandler implements ICommandHandler<
  ModerateReviewCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly reviews: ReviewRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, reviewId, body }: ModerateReviewCommand): Promise<CommandResult> {
    const review = await this.reviews.lock(reviewId);
    const moderatedAt = new Date();
    const version = review.version + 1;
    await this.tenant.tx
      .update(schoolReviews)
      .set({ status: body.status, moderatedAt, moderatedByUserId: actor.userId, version })
      .where(eq(schoolReviews.id, reviewId));
    await this.publisher.append([
      newEvent(ReviewModerated, {
        aggregateType: REVIEW_AGGREGATE,
        aggregateId: reviewId,
        aggregateVersion: version,
        payload: { reviewId, status: body.status, moderatedAt: moderatedAt.toISOString() },
      }),
    ]);
    return { id: reviewId, version };
  }
}

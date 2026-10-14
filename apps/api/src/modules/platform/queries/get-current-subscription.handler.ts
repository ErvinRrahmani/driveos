import { desc, eq, isNull } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { plans, subscriptions } from '../infra/schema.js';
import {
  type CurrentSubscription,
  GetCurrentSubscriptionQuery,
} from './get-current-subscription.query.js';

@QueryHandler(GetCurrentSubscriptionQuery)
export class GetCurrentSubscriptionHandler implements IQueryHandler<
  GetCurrentSubscriptionQuery,
  CurrentSubscription | null
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute(): Promise<CurrentSubscription | null> {
    const [row] = await this.tenant.tx
      .select({
        subscriptionId: subscriptions.id,
        planId: plans.id,
        planCode: plans.code,
        baseAmountMinor: plans.baseAmountMinor,
        studentFeeMinor: plans.studentFeeMinor,
        currency: plans.currency,
        features: plans.features,
        startedAt: subscriptions.startedAt,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(isNull(subscriptions.endedAt))
      .orderBy(desc(subscriptions.startedAt))
      .limit(1);
    return row ?? null;
  }
}

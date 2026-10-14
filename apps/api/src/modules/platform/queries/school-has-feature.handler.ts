import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { hasFeature } from '../domain/features.js';
import { GetCurrentSubscriptionQuery } from './get-current-subscription.query.js';
import { SchoolHasFeatureQuery } from './school-has-feature.query.js';

@QueryHandler(SchoolHasFeatureQuery)
export class SchoolHasFeatureHandler implements IQueryHandler<SchoolHasFeatureQuery, boolean> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute({ feature }: SchoolHasFeatureQuery): Promise<boolean> {
    const subscription = await this.queryBus.execute(new GetCurrentSubscriptionQuery());
    return subscription !== null && hasFeature(subscription.features, feature);
  }
}

import { Query } from '../../../kernel/cqrs/index.js';

export interface CurrentSubscription {
  subscriptionId: string;
  planId: string;
  planCode: string;
  baseAmountMinor: number;
  studentFeeMinor: number;
  currency: string;
  startedAt: Date;
}

export class GetCurrentSubscriptionQuery extends Query<CurrentSubscription | null> {}

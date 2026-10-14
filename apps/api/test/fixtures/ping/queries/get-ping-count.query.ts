import { Query } from '../../../../src/kernel/cqrs/index.js';

export interface PingCount {
  count: number;
}

export class GetPingCountQuery extends Query<PingCount> {}

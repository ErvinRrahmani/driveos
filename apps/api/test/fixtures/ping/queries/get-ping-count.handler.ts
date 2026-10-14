import { type IQueryHandler, QueryHandler } from '../../../../src/kernel/cqrs/index.js';
import { GetPingCountQuery, type PingCount } from './get-ping-count.query.js';

@QueryHandler(GetPingCountQuery)
export class GetPingCountHandler implements IQueryHandler<GetPingCountQuery, PingCount> {
  async execute(): Promise<PingCount> {
    return { count: 0 };
  }
}

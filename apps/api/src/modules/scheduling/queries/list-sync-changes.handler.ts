import type { SyncPullResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { forbidden } from '../infra/access.js';
import { ChangeFeedRecords } from '../infra/change-feed-records.js';
import { SyncChanges } from '../infra/sync-changes.js';
import { ListSyncChangesQuery } from './list-sync-changes.query.js';

@QueryHandler(ListSyncChangesQuery)
export class ListSyncChangesHandler implements IQueryHandler<
  ListSyncChangesQuery,
  SyncPullResponse
> {
  constructor(
    private readonly feed: ChangeFeedRecords,
    private readonly changes: SyncChanges,
  ) {}

  async execute({ actor, params }: ListSyncChangesQuery): Promise<SyncPullResponse> {
    const audience = actor.membershipId;
    if (!audience) throw forbidden();
    const cursor = params.cursor ?? '0';
    const rows = await this.feed.after(audience, cursor, params.limit + 1);
    const page = rows.slice(0, params.limit);
    return {
      items: await this.changes.resolve(page, audience),
      nextCursor: page.at(-1)?.seq ?? cursor,
      hasMore: rows.length > params.limit,
    };
  }
}

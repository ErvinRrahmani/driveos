import type { SyncPullQuery, SyncPullResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListSyncChangesQuery extends Query<SyncPullResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: SyncPullQuery,
  ) {
    super();
  }
}

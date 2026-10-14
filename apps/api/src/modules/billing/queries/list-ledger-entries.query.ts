import type { LedgerListResponse, ListLedgerQuery } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListLedgerEntriesQuery extends Query<LedgerListResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly params: ListLedgerQuery,
  ) {
    super();
  }
}

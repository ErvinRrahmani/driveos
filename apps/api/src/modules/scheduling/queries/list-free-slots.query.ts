import type { FreeSlotsQuery, FreeSlotsResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListFreeSlotsQuery extends Query<FreeSlotsResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: FreeSlotsQuery,
  ) {
    super();
  }
}

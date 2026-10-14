import type { TheoryStatsQuery, TheoryStatsResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetTheoryStatsQuery extends Query<TheoryStatsResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: TheoryStatsQuery,
  ) {
    super();
  }
}

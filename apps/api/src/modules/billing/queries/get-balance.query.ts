import type { StudentBalanceResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetBalanceQuery extends Query<StudentBalanceResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
  ) {
    super();
  }
}

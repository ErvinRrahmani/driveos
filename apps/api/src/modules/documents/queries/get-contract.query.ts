import type { ContractResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetContractQuery extends Query<ContractResponse> {
  constructor(
    readonly actor: Principal,
    readonly contractId: string,
  ) {
    super();
  }
}

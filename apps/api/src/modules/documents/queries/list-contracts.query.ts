import type {
  ContractListResponse,
  ListContractsQuery as ListContractsParams,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListContractsQuery extends Query<ContractListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListContractsParams,
  ) {
    super();
  }
}

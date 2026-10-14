import type {
  ListWaitingListQuery as ListWaitingListParams,
  WaitingListResponse,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListWaitingListQuery extends Query<WaitingListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListWaitingListParams,
  ) {
    super();
  }
}

import type {
  ListSlotOffersQuery as ListSlotOffersParams,
  SlotOfferListResponse,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListSlotOffersQuery extends Query<SlotOfferListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListSlotOffersParams,
  ) {
    super();
  }
}

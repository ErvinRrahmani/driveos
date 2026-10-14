import type { ShopQuery, ShopResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetShopQuery extends Query<ShopResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ShopQuery,
  ) {
    super();
  }
}

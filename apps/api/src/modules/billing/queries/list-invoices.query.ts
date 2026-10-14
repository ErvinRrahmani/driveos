import type { InvoiceListResponse, ListInvoicesQuery as ListInvoicesParams } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListInvoicesQuery extends Query<InvoiceListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListInvoicesParams,
  ) {
    super();
  }
}

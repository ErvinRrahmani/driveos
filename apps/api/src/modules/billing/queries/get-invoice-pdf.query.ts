import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export interface InvoicePdf {
  fileName: string;
  contentType: 'application/pdf';
  body: Uint8Array;
}

export class GetInvoicePdfQuery extends Query<InvoicePdf> {
  constructor(
    readonly actor: Principal,
    readonly invoiceId: string,
  ) {
    super();
  }
}

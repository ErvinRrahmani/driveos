import type { PaymentAccountStatus } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface SchoolPaymentAccount {
  id: string;
  provider: string;
  accountRef: string;
  status: PaymentAccountStatus;
}

export class GetPaymentAccountQuery extends Query<SchoolPaymentAccount | null> {}

import type { RecordCashPaymentRequest, RecordCashPaymentResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class RecordCashPaymentCommand extends Command<RecordCashPaymentResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: RecordCashPaymentRequest,
    readonly paymentId?: string,
  ) {
    super();
  }
}

import type { PaymentWebhookResponse } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';

export class HandlePaymentWebhookCommand extends Command<PaymentWebhookResponse> {
  constructor(
    readonly provider: string,
    readonly rawBody: Uint8Array,
    readonly headers: Readonly<Record<string, string | string[] | undefined>>,
  ) {
    super();
  }
}

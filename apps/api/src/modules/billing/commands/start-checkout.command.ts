import type { CheckoutRequest, CheckoutResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class StartCheckoutCommand extends Command<CheckoutResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: CheckoutRequest,
  ) {
    super();
  }
}

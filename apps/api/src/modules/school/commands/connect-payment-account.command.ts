import type { ConnectPaymentAccountRequest, ConnectPaymentAccountResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ConnectPaymentAccountCommand extends Command<ConnectPaymentAccountResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: ConnectPaymentAccountRequest,
  ) {
    super();
  }
}

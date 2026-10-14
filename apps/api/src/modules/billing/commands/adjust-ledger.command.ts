import type { AdjustLedgerRequest, AdjustLedgerResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class AdjustLedgerCommand extends Command<AdjustLedgerResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: AdjustLedgerRequest,
  ) {
    super();
  }
}

import type { MarkStatementPaidRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class MarkStatementPaidCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly statementId: string,
    readonly body: MarkStatementPaidRequest,
  ) {
    super();
  }
}

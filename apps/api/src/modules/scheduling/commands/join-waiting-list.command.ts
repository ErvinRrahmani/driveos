import type { JoinWaitingListRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class JoinWaitingListCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: JoinWaitingListRequest,
  ) {
    super();
  }
}

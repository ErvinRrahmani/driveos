import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class LeaveWaitingListCommand extends Command<void> {
  constructor(
    readonly actor: Principal,
    readonly entryId: string,
  ) {
    super();
  }
}

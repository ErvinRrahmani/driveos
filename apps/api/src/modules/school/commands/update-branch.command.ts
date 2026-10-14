import type { UpdateBranchRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateBranchCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly branchId: string,
    readonly patch: UpdateBranchRequest,
  ) {
    super();
  }
}

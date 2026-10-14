import type { UpdatePlanRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdatePlanCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly planId: string,
    readonly patch: UpdatePlanRequest,
  ) {
    super();
  }
}

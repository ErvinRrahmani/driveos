import type { CreateContractRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class CreateContractCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: CreateContractRequest,
  ) {
    super();
  }
}

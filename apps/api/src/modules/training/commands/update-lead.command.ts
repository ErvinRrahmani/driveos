import type { UpdateLeadRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateLeadCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly leadId: string,
    readonly body: UpdateLeadRequest,
  ) {
    super();
  }
}

import type { AddTimeOffRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class AddTimeOffCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly instructorMembershipId: string,
    readonly body: AddTimeOffRequest,
  ) {
    super();
  }
}

import type { UpdateMembershipRequest } from '@driveos/shared';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateMembershipCommand extends Command<CommandResult> {
  constructor(
    readonly membershipId: string,
    readonly callerRoles: readonly string[],
    readonly patch: UpdateMembershipRequest,
  ) {
    super();
  }
}

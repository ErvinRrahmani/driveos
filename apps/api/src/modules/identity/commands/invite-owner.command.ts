import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';
import type { CreatedInvitation } from './create-invitation.command.js';

export class InviteOwnerCommand extends Command<CreatedInvitation> {
  constructor(
    readonly actor: Principal,
    readonly contact: { phone?: string; email?: string },
  ) {
    super();
  }
}

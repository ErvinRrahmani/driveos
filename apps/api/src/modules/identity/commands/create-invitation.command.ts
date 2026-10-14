import type { InvitableRole } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';

export interface CreatedInvitation {
  id: string;
  version: number;
  acceptToken: string;
}

export class CreateInvitationCommand extends Command<CreatedInvitation> {
  constructor(
    readonly invitedBy: string,
    readonly roles: readonly InvitableRole[],
    readonly contact: { phone?: string; email?: string },
    readonly studentId: string | null,
    readonly branchIds: readonly string[],
  ) {
    super();
  }
}

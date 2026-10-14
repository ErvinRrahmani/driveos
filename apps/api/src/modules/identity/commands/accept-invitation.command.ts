import type { AcceptInvitationResponse } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';

export class AcceptInvitationCommand extends Command<AcceptInvitationResponse> {
  constructor(
    readonly token: string,
    readonly fullName: string | undefined,
    readonly locale: string | undefined,
  ) {
    super();
  }
}

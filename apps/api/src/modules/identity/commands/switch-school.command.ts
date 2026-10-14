import type { SessionResponse } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';
import type { RefreshClient } from '../domain/refresh-token.js';

export class SwitchSchoolCommand extends Command<SessionResponse> {
  constructor(
    readonly userId: string,
    readonly membershipId: string,
    readonly client: RefreshClient,
  ) {
    super();
  }
}

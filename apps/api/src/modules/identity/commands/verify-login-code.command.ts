import type { SessionResponse } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';
import type { RefreshClient } from '../domain/refresh-token.js';

export class VerifyLoginCodeCommand extends Command<SessionResponse> {
  constructor(
    readonly contact: string,
    readonly code: string,
    readonly client: RefreshClient,
  ) {
    super();
  }
}

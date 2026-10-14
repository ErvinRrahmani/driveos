import type { StartSupportSessionRequest, StartSupportSessionResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class StartSupportSessionCommand extends Command<StartSupportSessionResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: StartSupportSessionRequest,
  ) {
    super();
  }
}

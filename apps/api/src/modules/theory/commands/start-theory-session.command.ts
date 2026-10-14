import type { StartTheorySessionRequest, TheorySessionResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class StartTheorySessionCommand extends Command<TheorySessionResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: StartTheorySessionRequest,
  ) {
    super();
  }
}

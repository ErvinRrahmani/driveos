import type { TheorySessionResult } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class FinishTheorySessionCommand extends Command<TheorySessionResult> {
  constructor(
    readonly actor: Principal,
    readonly sessionId: string,
  ) {
    super();
  }
}

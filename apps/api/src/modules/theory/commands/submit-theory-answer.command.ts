import type { SubmitTheoryAnswerRequest, TheoryAnswerResult } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class SubmitTheoryAnswerCommand extends Command<TheoryAnswerResult> {
  constructor(
    readonly actor: Principal,
    readonly sessionId: string,
    readonly body: SubmitTheoryAnswerRequest,
  ) {
    super();
  }
}

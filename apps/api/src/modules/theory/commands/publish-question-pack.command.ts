import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class PublishQuestionPackCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly packId: string,
  ) {
    super();
  }
}

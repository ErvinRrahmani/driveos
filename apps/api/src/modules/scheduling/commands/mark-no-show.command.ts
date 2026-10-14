import type { MarkNoShowRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class MarkNoShowCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly lessonId: string,
    readonly body: MarkNoShowRequest,
  ) {
    super();
  }
}

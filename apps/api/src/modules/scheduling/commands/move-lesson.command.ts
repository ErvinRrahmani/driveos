import type { MoveLessonRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class MoveLessonCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly lessonId: string,
    readonly body: MoveLessonRequest,
  ) {
    super();
  }
}

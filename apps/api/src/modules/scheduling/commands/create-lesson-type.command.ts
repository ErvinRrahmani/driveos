import type { CreateLessonTypeRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class CreateLessonTypeCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: CreateLessonTypeRequest,
  ) {
    super();
  }
}

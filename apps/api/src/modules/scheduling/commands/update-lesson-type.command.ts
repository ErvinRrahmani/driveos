import type { UpdateLessonTypeRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateLessonTypeCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly lessonTypeId: string,
    readonly patch: UpdateLessonTypeRequest,
  ) {
    super();
  }
}

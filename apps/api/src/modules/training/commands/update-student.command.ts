import type { UpdateStudentRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateStudentCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly patch: UpdateStudentRequest,
  ) {
    super();
  }
}

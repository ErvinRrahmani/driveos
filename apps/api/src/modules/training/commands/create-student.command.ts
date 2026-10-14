import type { CreateStudentRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class CreateStudentCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: CreateStudentRequest,
  ) {
    super();
  }
}

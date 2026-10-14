import type { ArchiveStudentRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class ArchiveStudentCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly body: ArchiveStudentRequest,
  ) {
    super();
  }
}

import type { CreateEnrolmentRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class EnrolStudentCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly body: CreateEnrolmentRequest,
  ) {
    super();
  }
}

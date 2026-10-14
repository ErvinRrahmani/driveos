import type { ReplaceStudentInstructorsRequest, StudentInstructorsResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ReplaceStudentInstructorsCommand extends Command<StudentInstructorsResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly body: ReplaceStudentInstructorsRequest,
  ) {
    super();
  }
}

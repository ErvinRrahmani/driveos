import type { StudentExportResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ExportStudentDataCommand extends Command<StudentExportResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
  ) {
    super();
  }
}

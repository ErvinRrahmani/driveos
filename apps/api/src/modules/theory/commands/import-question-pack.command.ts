import type { ImportQuestionPackRequest, ImportQuestionPackResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ImportQuestionPackCommand extends Command<ImportQuestionPackResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: ImportQuestionPackRequest,
  ) {
    super();
  }
}

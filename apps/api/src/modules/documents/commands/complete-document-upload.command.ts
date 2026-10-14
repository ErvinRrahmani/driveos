import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class CompleteDocumentUploadCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly documentId: string,
  ) {
    super();
  }
}

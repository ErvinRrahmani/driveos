import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export interface PrivateNoteInput {
  noteId?: string;
  lessonId: string;
  studentId: string;
  body: string;
}

export class UpsertPrivateNoteCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly input: PrivateNoteInput,
  ) {
    super();
  }
}

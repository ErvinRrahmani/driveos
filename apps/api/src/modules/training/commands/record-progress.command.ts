import type { ProgressInput } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export interface RecordProgressInput {
  lessonId: string;
  studentId: string;
  entries: readonly (ProgressInput & { id?: string })[];
}

export interface RecordedProgress {
  entries: { id: string; version: number }[];
}

export class RecordProgressCommand extends Command<RecordedProgress> {
  constructor(
    readonly actor: Principal,
    readonly input: RecordProgressInput,
  ) {
    super();
  }
}

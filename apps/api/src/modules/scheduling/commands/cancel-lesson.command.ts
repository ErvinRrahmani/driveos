import type { CancelLessonRequest, CancelLessonResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class CancelLessonCommand extends Command<CancelLessonResponse> {
  constructor(
    readonly actor: Principal,
    readonly lessonId: string,
    readonly body: CancelLessonRequest,
  ) {
    super();
  }
}

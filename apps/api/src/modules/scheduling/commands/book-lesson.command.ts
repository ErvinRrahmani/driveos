import type { BookedVia, BookLessonRequest, LessonResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class BookLessonCommand extends Command<LessonResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: BookLessonRequest,
    readonly lessonId?: string,
    readonly bookedVia?: BookedVia,
  ) {
    super();
  }
}

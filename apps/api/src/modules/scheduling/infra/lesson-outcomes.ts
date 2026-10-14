import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Principal } from '../../../kernel/auth/principal.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { hasStarted } from '../domain/outcome.js';
import { forbidden } from './access.js';
import { LessonActors, type LockedLesson } from './lesson-actors.js';
import { LessonViews } from './lesson-views.js';
import { lessons } from './schema.js';

export interface RecordableLesson {
  lesson: LockedLesson;
  by: string;
}

@Injectable()
export class LessonOutcomes {
  constructor(
    private readonly tenant: TenantContext,
    private readonly actors: LessonActors,
    private readonly views: LessonViews,
  ) {}

  async lockRecordable(
    actor: Principal,
    lessonId: string,
    expectedVersion: number | undefined,
  ): Promise<RecordableLesson> {
    const by = actor.membershipId;
    if (!by) throw forbidden();
    const lesson = await this.actors.lock(lessonId);
    const { scope } = await this.actors.resolve(actor, lesson, 'lessons.complete');
    if (scope === 'own') throw forbidden();
    if (lesson.status !== 'booked') {
      throw new ConflictError('lesson_not_booked', t('errors.lesson_not_booked'));
    }
    if (expectedVersion !== undefined && expectedVersion !== lesson.version) {
      const [serverVersion] = await this.views.toResponses([lesson]);
      throw new ConflictError('version_conflict', t('errors.version_conflict'), { serverVersion });
    }
    if (!hasStarted(lesson.period.start, new Date())) {
      throw new ConflictError('lesson_not_started', t('errors.lesson_not_started'));
    }
    return { lesson, by };
  }

  async record(lesson: LockedLesson, status: 'completed' | 'no_show'): Promise<number> {
    const version = lesson.version + 1;
    await this.tenant.tx.update(lessons).set({ status, version }).where(eq(lessons.id, lesson.id));
    return version;
  }
}

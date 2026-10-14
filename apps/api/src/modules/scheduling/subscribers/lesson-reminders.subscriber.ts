import { type EventPayload, LessonBooked, LessonCancelled, LessonMoved } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { ReminderJobs } from '../infra/reminder-jobs.js';

type Payload =
  | EventPayload<typeof LessonBooked>
  | EventPayload<typeof LessonMoved>
  | EventPayload<typeof LessonCancelled>;

@Injectable()
@EventSubscriber({
  name: 'scheduling.lesson-reminders',
  events: [LessonBooked, LessonMoved, LessonCancelled],
})
export class LessonRemindersSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: LessonRecords,
    private readonly reminders: ReminderJobs,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Lesson reminders need a school scope');
    const lesson = await this.records.byId(payload.lessonId);
    if (!lesson || lesson.status !== 'booked') {
      await this.reminders.clear(payload.lessonId);
      return;
    }
    await this.reminders.schedule(schoolId, lesson.id, lesson.period.start);
  }
}

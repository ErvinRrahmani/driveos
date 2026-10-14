import {
  type EventPayload,
  LessonBooked,
  LessonCancelled,
  LessonMoved,
  type NotificationTiming,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';
import type { NotificationTemplate } from '../domain/templates.js';
import { NotificationClock } from '../infra/notification-clock.js';
import { StudentAudience } from '../infra/student-audience.js';

type Payload =
  | EventPayload<typeof LessonBooked>
  | EventPayload<typeof LessonMoved>
  | EventPayload<typeof LessonCancelled>;

export const IMMEDIATE_CHANGE_WINDOW_MS = 12 * 60 * 60_000;

@Injectable()
@EventSubscriber({
  name: 'messaging.lesson-notifications',
  events: [LessonBooked, LessonMoved, LessonCancelled],
})
export class LessonNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly directory: MembershipDirectory,
    private readonly audience: StudentAudience,
    private readonly clock: NotificationClock,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const { payload } = event;
    const userIds = (await this.audience.userIdsOf(payload.studentId)).filter(
      (userId) => userId !== event.actorUserId,
    );
    if (userIds.length === 0) return;
    const now = this.clock.now();
    const soon = (iso: string) => {
      const until = Date.parse(iso) - now.getTime();
      return until > 0 && until <= IMMEDIATE_CHANGE_WINDOW_MS;
    };
    const previousStart = 'previousStart' in payload ? payload.previousStart : undefined;
    const template: NotificationTemplate =
      event.type === LessonCancelled.type
        ? 'lesson_cancelled'
        : previousStart
          ? 'lesson_moved'
          : 'lesson_booked';
    const urgent =
      template !== 'lesson_booked' &&
      (soon(payload.start) || (previousStart !== undefined && soon(previousStart)));
    const timing: NotificationTiming = urgent ? 'immediate' : 'deferred';
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds },
        template,
        payload: {
          lessonId: payload.lessonId,
          start: payload.start,
          instructorName: await this.instructorName(payload.instructorMembershipId),
          ...(previousStart ? { previousStart } : {}),
        },
        timing,
        skipAfter: new Date(payload.start),
      }),
    );
  }

  private async instructorName(membershipId: string): Promise<string> {
    const userId = await this.directory.userIdOf(membershipId);
    if (!userId) return '';
    const [contact] = await this.directory.contactsOf([userId]);
    return contact?.fullName ?? '';
  }
}

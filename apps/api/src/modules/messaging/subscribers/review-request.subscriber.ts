import { type EventPayload, TestAttemptRecorded } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../kernel/config/env.js';
import { CommandBus, type DomainEvent, QueryBus } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SchoolHasFeatureQuery } from '../../platform/index.js';
import { GetPublicProfileQuery } from '../../school/index.js';
import { GetStudentRecipientsQuery } from '../../training/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof TestAttemptRecorded>;

/**
 * Asks a student who passed the practical test, once, to review the school (enrolment page §5.4).
 * Only at a school whose plan has `enrolment_page` (reviews are part of that feature); elsewhere
 * the event is skipped silently.
 */
@Injectable()
@EventSubscriber({ name: 'messaging.review-request', events: [TestAttemptRecorded] })
export class ReviewRequestSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    if (payload.kind !== 'practical' || payload.result !== 'passed') return;
    if (!(await this.queryBus.execute(new SchoolHasFeatureQuery('enrolment_page')))) return;
    const { studentId } = payload;
    const recipients = await this.queryBus.execute(new GetStudentRecipientsQuery(studentId));
    if (!recipients?.studentUserId) return;
    const profile = await this.queryBus.execute(new GetPublicProfileQuery());
    const scheme = this.config.get('MOBILE_DEEP_LINK_SCHEME', { infer: true });
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: [recipients.studentUserId] },
        template: 'review_request',
        payload: {
          studentId,
          url: `${scheme}student/review`,
          externalReviewUrl: profile?.externalReviewUrl ?? null,
        },
        timing: 'deferred',
        dedupeKey: `review_request:${studentId}`,
      }),
    );
  }
}

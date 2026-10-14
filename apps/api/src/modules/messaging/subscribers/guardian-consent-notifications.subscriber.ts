import { type EventPayload, GuardianLinked } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../kernel/config/env.js';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof GuardianLinked>;

@Injectable()
@EventSubscriber({ name: 'messaging.guardian-consent-notifications', events: [GuardianLinked] })
export class GuardianConsentNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    if (!payload.consentRequired) return;
    const base = this.config.get('APP_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: [payload.guardianUserId] },
        template: 'guardian_consent_requested',
        payload: {
          guardianLinkId: payload.guardianLinkId,
          studentId: payload.studentId,
          url: `${base}/parent/consent/${payload.guardianLinkId}`,
        },
        timing: 'deferred',
        dedupeKey: `guardian-consent:${payload.guardianLinkId}`,
      }),
    );
  }
}

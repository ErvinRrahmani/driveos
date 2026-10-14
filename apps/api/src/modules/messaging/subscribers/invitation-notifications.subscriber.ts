import { type EventPayload, InvitationCreated } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../kernel/config/env.js';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof InvitationCreated>;

@Injectable()
@EventSubscriber({ name: 'messaging.invitation-notifications', events: [InvitationCreated] })
export class InvitationNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    const base = this.config.get('APP_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { contacts: [{ phone: payload.phone, email: payload.email }] },
        template: 'invitation',
        payload: {
          url: `${base}/invitations/${encodeURIComponent(payload.acceptToken)}`,
          expiresAt: payload.expiresAt,
        },
        timing: 'deferred',
        skipAfter: new Date(payload.expiresAt),
      }),
    );
  }
}

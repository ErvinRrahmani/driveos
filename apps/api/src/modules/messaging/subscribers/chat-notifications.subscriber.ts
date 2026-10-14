import { type EventPayload, MessageSent } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof MessageSent>;

@Injectable()
@EventSubscriber({ name: 'messaging.chat-notifications', events: [MessageSent] })
export class ChatNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly directory: MembershipDirectory,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    if (payload.recipientUserIds.length === 0) return;
    const [sender] = await this.directory.contactsOf([payload.senderUserId]);
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: payload.recipientUserIds },
        template: 'message_received',
        payload: {
          conversationId: payload.conversationId,
          senderName: sender?.fullName ?? '',
          preview: payload.preview,
        },
        timing: 'immediate',
      }),
    );
  }
}

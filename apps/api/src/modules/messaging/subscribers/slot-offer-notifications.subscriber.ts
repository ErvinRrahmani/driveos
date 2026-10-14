import { type EventPayload, SlotOfferCreated } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';
import { StudentAudience } from '../infra/student-audience.js';

type Payload = EventPayload<typeof SlotOfferCreated>;

@Injectable()
@EventSubscriber({ name: 'messaging.slot-offer-notifications', events: [SlotOfferCreated] })
export class SlotOfferNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly audience: StudentAudience,
  ) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    const userIds = new Set<string>();
    for (const studentId of payload.offeredToStudentIds) {
      for (const userId of await this.audience.userIdsOf(studentId)) userIds.add(userId);
    }
    if (userIds.size === 0) return;
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: [...userIds] },
        template: 'slot_offer_created',
        payload: { offerId: payload.offerId, start: payload.start, expiresAt: payload.expiresAt },
        timing: 'email_only_at_night',
        skipAfter: new Date(payload.expiresAt),
      }),
    );
  }
}

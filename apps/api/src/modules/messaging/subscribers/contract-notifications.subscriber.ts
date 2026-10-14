import { ContractCreated, type EventPayload } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof ContractCreated>;

@Injectable()
@EventSubscriber({ name: 'messaging.contract-notifications', events: [ContractCreated] })
export class ContractNotificationsSubscriber implements EventHandler<Payload> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: payload.signerUserIds },
        template: 'contract_created',
        payload: { contractId: payload.contractId },
        timing: 'deferred',
      }),
    );
  }
}

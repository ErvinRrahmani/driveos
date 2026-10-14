import { type EventPayload, GrowthReportGenerated } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof GrowthReportGenerated>;

@Injectable()
@EventSubscriber({
  name: 'messaging.growth-report-notifications',
  events: [GrowthReportGenerated],
})
export class GrowthReportNotificationsSubscriber implements EventHandler<Payload> {
  constructor(private readonly commandBus: CommandBus) {}

  async handle({ payload }: DomainEvent<Payload>): Promise<void> {
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds: payload.ownerUserIds },
        template: 'growth_report_generated',
        payload: { reportId: payload.reportId, month: payload.month },
        timing: 'deferred',
      }),
    );
  }
}

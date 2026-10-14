import { type EventPayload, LeadCaptured } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { MembershipDirectory, type SchoolRole } from '../../identity/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';

type Payload = EventPayload<typeof LeadCaptured>;

/** The roles that hold `leads.read`. */
const LEAD_READERS: readonly SchoolRole[] = ['owner', 'office'];

@Injectable()
@EventSubscriber({ name: 'messaging.lead-notifications', events: [LeadCaptured] })
export class LeadNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly directory: MembershipDirectory,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    // listStaff reads roles and status in one query (listByRole per role would also load every
    // member's branches and grants, which this does not need).
    const staff = await this.directory.listStaff();
    const userIds = [
      ...new Set(
        staff
          .filter(
            (member) =>
              member.status === 'active' &&
              member.roles.some((role) => LEAD_READERS.includes(role)),
          )
          .map((member) => member.userId),
      ),
    ].filter((userId) => userId !== event.actorUserId);
    if (userIds.length === 0) return;
    const { leadId, fullName, licenceClass } = event.payload;
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds },
        template: 'lead_captured',
        payload: { leadId, fullName, licenceClass },
        timing: 'deferred',
      }),
    );
  }
}

import { type EventPayload, LeadCaptured, LeadEnquiryRepeated } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { CommandBus, type DomainEvent, QueryBus } from '../../../kernel/cqrs/index.js';
import { NotFoundError } from '../../../kernel/http/errors.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { MembershipDirectory, type SchoolRole } from '../../identity/index.js';
import { GetLeadQuery } from '../../training/index.js';
import { SendNotificationCommand } from '../commands/send-notification.command.js';
import type { TemplatePayload } from '../domain/templates.js';

type Payload = EventPayload<typeof LeadCaptured> | EventPayload<typeof LeadEnquiryRepeated>;

/** The roles that hold `leads.read`. */
const LEAD_READERS: readonly SchoolRole[] = ['owner', 'office'];

/**
 * `lead_captured` to the school's lead readers on a new lead and, with `repeated: true`
 * ("… enquired again"), on a repeat enquiry.
 */
@Injectable()
@EventSubscriber({
  name: 'messaging.lead-notifications',
  events: [LeadCaptured, LeadEnquiryRepeated],
})
export class LeadNotificationsSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly directory: MembershipDirectory,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const payload = await this.templatePayload(event);
    if (!payload) return;
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
    await this.commandBus.execute(
      new SendNotificationCommand({
        recipients: { userIds },
        template: 'lead_captured',
        payload,
        timing: 'deferred',
      }),
    );
  }

  private async templatePayload(
    event: DomainEvent<Payload>,
  ): Promise<TemplatePayload<'lead_captured'> | null> {
    if (event.type === LeadCaptured.type) {
      const { leadId, fullName, licenceClass } = event.payload as EventPayload<typeof LeadCaptured>;
      return { leadId, fullName, licenceClass };
    }
    // A repeat enquiry carries no name; read it from the lead (gone after anonymization or purge).
    const { leadId } = event.payload;
    try {
      const lead = await this.queryBus.execute(new GetLeadQuery(leadId));
      return { leadId, fullName: lead.fullName, licenceClass: lead.licenceClass, repeated: true };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}

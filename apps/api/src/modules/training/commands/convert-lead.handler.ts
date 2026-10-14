import { type ConvertLeadResponse, LeadConverted } from '@driveos/shared';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { CreateInvitationCommand } from '../../identity/index.js';
import { LeadStream } from '../events/lead-stream.js';
import { LeadRecords } from '../infra/lead-records.js';
import { leadAlreadyConverted } from '../infra/training-errors.js';
import { CreateStudentCommand } from './create-student.command.js';
import { ConvertLeadCommand } from './convert-lead.command.js';
import { LinkGuardianCommand } from './link-guardian.command.js';

const guardianContactOf = (contact: string) =>
  contact.includes('@') ? { email: contact } : { phone: contact };

@CommandHandler(ConvertLeadCommand)
export class ConvertLeadHandler implements ICommandHandler<
  ConvertLeadCommand,
  ConvertLeadResponse
> {
  constructor(
    private readonly leads: LeadRecords,
    private readonly commandBus: CommandBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, leadId, body }: ConvertLeadCommand): Promise<ConvertLeadResponse> {
    const lead = await this.leads.lock(leadId);
    if (lead.status === 'converted') throw leadAlreadyConverted();
    const { invite, inviteParent, ...student } = body;
    const created = await this.commandBus.execute(
      new CreateStudentCommand(actor, {
        ...student,
        fullName: lead.fullName,
        licenceClass: lead.licenceClass,
      }),
    );
    const studentId = created.id;
    const invitation = invite
      ? await this.commandBus.execute(
          new CreateInvitationCommand(
            actor.userId,
            ['student'],
            { phone: lead.phone ?? undefined, email: lead.email ?? undefined },
            studentId,
            [],
          ),
        )
      : null;
    const parentInvitation =
      inviteParent && lead.isMinor && lead.guardianContact
        ? await this.commandBus.execute(
            new LinkGuardianCommand(actor, studentId, guardianContactOf(lead.guardianContact)),
          )
        : null;

    const now = new Date();
    const stream = new LeadStream(leadId, lead.version);
    stream.add(LeadConverted, { leadId, studentId, convertedAt: now.toISOString() });
    await this.leads.update(leadId, {
      status: 'converted',
      studentId,
      convertedAt: now,
      lostAt: null,
      lostReason: null,
      version: stream.version,
    });
    await this.publisher.append(stream.events);
    return {
      id: leadId,
      version: stream.version,
      studentId,
      invitationId: invitation?.id ?? null,
      parentInvitationId: parentInvitation?.id ?? null,
    };
  }
}

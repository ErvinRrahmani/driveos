import { LeadStatusChanged } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { LeadStream } from '../events/lead-stream.js';
import { LeadRecords, type NewLeadRow } from '../infra/lead-records.js';
import { leadAlreadyConverted } from '../infra/training-errors.js';
import { UpdateLeadCommand } from './update-lead.command.js';

@CommandHandler(UpdateLeadCommand)
export class UpdateLeadHandler implements ICommandHandler<UpdateLeadCommand, CommandResult> {
  constructor(
    private readonly leads: LeadRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ leadId, body }: UpdateLeadCommand): Promise<CommandResult> {
    const lead = await this.leads.lock(leadId);
    if (body.status !== undefined && lead.status === 'converted') throw leadAlreadyConverted();
    const now = new Date();
    const stream = new LeadStream(leadId, lead.version);
    const changes: Partial<NewLeadRow> = {};
    if (body.note !== undefined) changes.note = body.note === '' ? null : body.note;
    if (body.status === 'lost') {
      changes.lostAt = lead.status === 'lost' ? lead.lostAt : now;
      changes.lostReason = body.lostReason ?? (lead.status === 'lost' ? lead.lostReason : null);
    } else if (body.status === 'contacted') {
      changes.lostAt = null;
      changes.lostReason = null;
    }
    if (body.status !== undefined && body.status !== lead.status) {
      changes.status = body.status;
      stream.add(LeadStatusChanged, {
        leadId,
        status: body.status,
        changedAt: now.toISOString(),
      });
    } else {
      stream.bump();
    }
    await this.leads.update(leadId, { ...changes, version: stream.version });
    await this.publisher.append(stream.events);
    return { id: leadId, version: stream.version };
  }
}

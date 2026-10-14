import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { leadPurgeCutoffs } from '../domain/leads.js';
import { LeadRecords } from '../infra/lead-records.js';
import { PurgeLeadsCommand, type PurgedLeads } from './purge-leads.command.js';

@CommandHandler(PurgeLeadsCommand)
export class PurgeLeadsHandler implements ICommandHandler<PurgeLeadsCommand, PurgedLeads> {
  constructor(private readonly leads: LeadRecords) {}

  execute({ now }: PurgeLeadsCommand): Promise<PurgedLeads> {
    return this.leads.purge(leadPurgeCutoffs(now));
  }
}

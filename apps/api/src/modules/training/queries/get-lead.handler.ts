import type { Lead } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { LeadRecords, toLead } from '../infra/lead-records.js';
import { GetLeadQuery } from './get-lead.query.js';

@QueryHandler(GetLeadQuery)
export class GetLeadHandler implements IQueryHandler<GetLeadQuery, Lead> {
  constructor(private readonly leads: LeadRecords) {}

  async execute({ id }: GetLeadQuery): Promise<Lead> {
    const row = await this.leads.find(id);
    if (!row) throw notFound();
    return toLead(row);
  }
}

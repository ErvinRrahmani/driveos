import type { LeadListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { LeadRecords } from '../infra/lead-records.js';
import { ListLeadsQuery } from './list-leads.query.js';

@QueryHandler(ListLeadsQuery)
export class ListLeadsHandler implements IQueryHandler<ListLeadsQuery, LeadListResponse> {
  constructor(private readonly leads: LeadRecords) {}

  execute({ params }: ListLeadsQuery): Promise<LeadListResponse> {
    return this.leads.page(params);
  }
}

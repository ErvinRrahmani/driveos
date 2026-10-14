import type { LeadListResponse, ListLeadsQuery as ListLeadsParams } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

/** The current school's leads, newest first, by status and a name/phone/email search. */
export class ListLeadsQuery extends Query<LeadListResponse> {
  constructor(readonly params: ListLeadsParams) {
    super();
  }
}

import type { InvitationListResponse, MembershipRole } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface InvitationFilter {
  studentId?: string;
  role?: MembershipRole;
}

export class ListInvitationsQuery extends Query<InvitationListResponse> {
  constructor(
    readonly limit: number,
    readonly cursor?: string,
    readonly filter: InvitationFilter = {},
  ) {
    super();
  }
}

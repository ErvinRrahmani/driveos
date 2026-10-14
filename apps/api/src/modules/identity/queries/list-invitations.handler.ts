import type { InvitationListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { InvitationsRepository } from '../infra/invitations.repository.js';
import { ListInvitationsQuery } from './list-invitations.query.js';

@QueryHandler(ListInvitationsQuery)
export class ListInvitationsHandler implements IQueryHandler<
  ListInvitationsQuery,
  InvitationListResponse
> {
  constructor(private readonly invitations: InvitationsRepository) {}

  async execute(query: ListInvitationsQuery): Promise<InvitationListResponse> {
    const rows = await this.invitations.listOpen(
      new Date(),
      query.limit + 1,
      query.cursor,
      query.filter,
    );
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        roles: row.roles,
        phone: row.phone,
        email: row.email,
        studentId: row.studentId,
        branchIds: row.branchIds,
        invitedBy: row.invitedBy,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

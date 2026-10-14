import { Injectable } from '@nestjs/common';
import { and, arrayContains, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { SchoolRole } from '../domain/permissions.js';
import type { InvitationFilter } from '../queries/list-invitations.query.js';
import { invitations } from './schema.js';

export interface InvitationRow {
  id: string;
  schoolId: string;
  roles: SchoolRole[];
  phone: string | null;
  email: string | null;
  studentId: string | null;
  branchIds: string[];
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

export type NewInvitation = Omit<InvitationRow, 'acceptedAt' | 'createdAt'> & { tokenHash: string };

const columns = {
  id: invitations.id,
  schoolId: invitations.schoolId,
  roles: invitations.roles,
  phone: invitations.phone,
  email: invitations.email,
  studentId: invitations.studentId,
  branchIds: invitations.branchIds,
  invitedBy: invitations.invitedBy,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  createdAt: invitations.createdAt,
};

@Injectable()
export class InvitationsRepository {
  constructor(private readonly tenant: TenantContext) {}

  async insert(invitation: NewInvitation): Promise<void> {
    await this.tenant.tx.insert(invitations).values(invitation);
  }

  async lockById(id: string): Promise<InvitationRow | null> {
    const [row] = await this.tenant.tx
      .select(columns)
      .from(invitations)
      .where(eq(invitations.id, id))
      .for('update');
    return (row as InvitationRow | undefined) ?? null;
  }

  async markAccepted(id: string, now: Date): Promise<void> {
    await this.tenant.tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, id));
  }

  async listOpen(
    now: Date,
    limit: number,
    cursor?: string,
    filter: InvitationFilter = {},
  ): Promise<InvitationRow[]> {
    const rows = await this.tenant.tx
      .select(columns)
      .from(invitations)
      .where(
        and(
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
          cursor ? lt(invitations.id, cursor) : sql`true`,
          filter.studentId ? eq(invitations.studentId, filter.studentId) : undefined,
          filter.role ? arrayContains(invitations.roles, [filter.role]) : undefined,
        ),
      )
      .orderBy(desc(invitations.id))
      .limit(limit);
    return rows as InvitationRow[];
  }
}

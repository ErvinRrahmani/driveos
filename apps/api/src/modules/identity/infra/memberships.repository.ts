import { Injectable } from '@nestjs/common';
import { and, arrayContains, asc, eq, ne, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { SchoolRole } from '../domain/permissions.js';
import type { MembershipStatus } from '../domain/session.js';
import { membershipBranches, memberships, permissionGrants } from './schema.js';

export interface MembershipRow {
  id: string;
  schoolId: string;
  userId: string;
  roles: SchoolRole[];
  status: MembershipStatus;
  version: number;
}

const columns = {
  id: memberships.id,
  schoolId: memberships.schoolId,
  userId: memberships.userId,
  roles: memberships.roles,
  status: memberships.status,
  version: memberships.version,
};

@Injectable()
export class MembershipsRepository {
  constructor(private readonly tenant: TenantContext) {}

  async lockById(id: string): Promise<MembershipRow | null> {
    const [row] = await this.tenant.tx
      .select(columns)
      .from(memberships)
      .where(eq(memberships.id, id))
      .for('update');
    return (row as MembershipRow | undefined) ?? null;
  }

  async lockByUser(userId: string): Promise<MembershipRow | null> {
    const [row] = await this.tenant.tx
      .select(columns)
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .for('update');
    return (row as MembershipRow | undefined) ?? null;
  }

  async insert(row: Omit<MembershipRow, 'version'>): Promise<void> {
    await this.tenant.tx.insert(memberships).values({ ...row, version: 1 });
  }

  async update(
    id: string,
    changes: { roles: SchoolRole[]; status: MembershipStatus; version: number },
  ): Promise<void> {
    await this.tenant.tx.update(memberships).set(changes).where(eq(memberships.id, id));
  }

  async branchIds(id: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .select({ branchId: membershipBranches.branchId })
      .from(membershipBranches)
      .where(eq(membershipBranches.membershipId, id))
      .orderBy(asc(membershipBranches.branchId));
    return rows.map((row) => row.branchId);
  }

  async addBranches(schoolId: string, id: string, branchIds: readonly string[]): Promise<number> {
    if (branchIds.length === 0) return 0;
    const inserted = await this.tenant.tx
      .insert(membershipBranches)
      .values(branchIds.map((branchId) => ({ schoolId, membershipId: id, branchId })))
      .onConflictDoNothing()
      .returning({ branchId: membershipBranches.branchId });
    return inserted.length;
  }

  async replaceBranches(schoolId: string, id: string, branchIds: readonly string[]): Promise<void> {
    await this.tenant.tx.delete(membershipBranches).where(eq(membershipBranches.membershipId, id));
    await this.addBranches(schoolId, id, branchIds);
  }

  async grants(id: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .select({ permission: permissionGrants.permission })
      .from(permissionGrants)
      .where(eq(permissionGrants.membershipId, id))
      .orderBy(asc(permissionGrants.permission));
    return rows.map((row) => row.permission);
  }

  async replaceGrants(schoolId: string, id: string, grants: readonly string[]): Promise<void> {
    await this.tenant.tx.delete(permissionGrants).where(eq(permissionGrants.membershipId, id));
    if (grants.length === 0) return;
    await this.tenant.tx
      .insert(permissionGrants)
      .values(grants.map((permission) => ({ schoolId, membershipId: id, permission })));
  }

  async lockOwners(schoolId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('memberships.owners'), hashtext(${schoolId}))`,
    );
  }

  async countOtherActiveOwners(id: string): Promise<number> {
    const [row] = await this.tenant.tx
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          ne(memberships.id, id),
          eq(memberships.status, 'active'),
          arrayContains(memberships.roles, ['owner']),
        ),
      );
    return row?.n ?? 0;
  }
}

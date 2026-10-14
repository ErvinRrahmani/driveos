import { Injectable } from '@nestjs/common';
import { and, arrayContains, arrayOverlaps, asc, eq, inArray } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { SchoolRole } from '../domain/permissions.js';
import type { MembershipStatus } from '../domain/session.js';
import { membershipBranches, memberships, permissionGrants, users } from './schema.js';

export interface MembershipRecord {
  id: string;
  userId: string;
  roles: SchoolRole[];
  status: MembershipStatus;
  version: number;
  branchIds: string[];
  grants: string[];
}

export interface StaffMember {
  membershipId: string;
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  roles: SchoolRole[];
  status: MembershipStatus;
}

export interface UserContact {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

const STAFF_ROLES: SchoolRole[] = ['owner', 'office', 'instructor'];

const columns = {
  id: memberships.id,
  userId: memberships.userId,
  roles: memberships.roles,
  status: memberships.status,
  version: memberships.version,
};

type MembershipBase = Omit<MembershipRecord, 'branchIds' | 'grants'>;

@Injectable()
export class MembershipDirectory {
  constructor(private readonly tenant: TenantContext) {}

  async getMembership(id: string): Promise<MembershipRecord | null> {
    const [row] = await this.tenant.tx
      .select(columns)
      .from(memberships)
      .where(eq(memberships.id, id));
    return row ? this.withDetails(row as MembershipBase) : null;
  }

  async findByUser(userId: string): Promise<MembershipRecord | null> {
    const [row] = await this.tenant.tx
      .select(columns)
      .from(memberships)
      .where(eq(memberships.userId, userId));
    return row ? this.withDetails(row as MembershipBase) : null;
  }

  async listByRole(role: SchoolRole): Promise<MembershipRecord[]> {
    const rows = await this.tenant.tx
      .select(columns)
      .from(memberships)
      .where(arrayContains(memberships.roles, [role]))
      .orderBy(asc(memberships.id));
    return Promise.all(rows.map((row) => this.withDetails(row as MembershipBase)));
  }

  async userIdOf(membershipId: string): Promise<string | null> {
    const [row] = await this.tenant.tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.id, membershipId));
    return row?.userId ?? null;
  }

  async hasRole(membershipId: string, role: SchoolRole): Promise<boolean> {
    const rows = await this.tenant.tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.id, membershipId),
          eq(memberships.status, 'active'),
          arrayContains(memberships.roles, [role]),
        ),
      );
    return rows.length > 0;
  }

  async listStaff(): Promise<StaffMember[]> {
    const rows = await this.tenant.tx
      .select({
        membershipId: memberships.id,
        userId: memberships.userId,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        roles: memberships.roles,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(arrayOverlaps(memberships.roles, STAFF_ROLES))
      .orderBy(asc(users.fullName), asc(memberships.id));
    return rows as StaffMember[];
  }

  async contactsOf(userIds: readonly string[]): Promise<UserContact[]> {
    if (userIds.length === 0) return [];
    return this.tenant.tx
      .select({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(inArray(users.id, [...userIds]))
      .orderBy(asc(users.id));
  }

  async localesOf(userIds: readonly string[]): Promise<{ userId: string; locale: string }[]> {
    if (userIds.length === 0) return [];
    return this.tenant.tx
      .selectDistinct({ userId: users.id, locale: users.locale })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(inArray(users.id, [...userIds]))
      .orderBy(asc(users.id));
  }

  private async withDetails(row: MembershipBase): Promise<MembershipRecord> {
    const branches = await this.tenant.tx
      .select({ branchId: membershipBranches.branchId })
      .from(membershipBranches)
      .where(eq(membershipBranches.membershipId, row.id))
      .orderBy(asc(membershipBranches.branchId));
    const grants = await this.tenant.tx
      .select({ permission: permissionGrants.permission })
      .from(permissionGrants)
      .where(eq(permissionGrants.membershipId, row.id))
      .orderBy(asc(permissionGrants.permission));
    return {
      ...row,
      branchIds: branches.map((b) => b.branchId),
      grants: grants.map((g) => g.permission),
    };
  }
}

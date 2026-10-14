import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { MembershipStatus, MembershipView } from '../domain/session.js';
import { platformAdmins } from './schema.js';

interface MembershipRow extends Record<string, unknown> {
  membership_id: string;
  school_id: string;
  school_name: string;
  roles: string[];
  status: MembershipStatus;
}

interface InvitationLookupRow extends Record<string, unknown> {
  invitation_id: string;
  school_id: string;
  roles: string[];
  phone: string | null;
  email: string | null;
  student_id: string | null;
  expires_at: string | Date;
  accepted_at: string | Date | null;
}

export interface InvitationLookup {
  invitationId: string;
  schoolId: string;
  roles: string[];
  phone: string | null;
  email: string | null;
  studentId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
}

@Injectable()
export class AuthDirectory {
  constructor(private readonly tenant: TenantContext) {}

  async loginAllowed(contact: string): Promise<boolean> {
    const result = await this.tenant.tx.execute<{ allowed: boolean }>(
      sql`select auth_login_allowed(${contact}) as allowed`,
    );
    return result.rows[0]?.allowed === true;
  }

  async findUserByContact(contact: string): Promise<string | null> {
    const result = await this.tenant.tx.execute<{ user_id: string | null }>(
      sql`select auth_find_user_by_contact(${contact}) as user_id`,
    );
    return result.rows[0]?.user_id ?? null;
  }

  async membershipsForUser(userId: string): Promise<MembershipView[]> {
    const result = await this.tenant.tx.execute<MembershipRow>(
      sql`select membership_id, school_id, school_name, roles, status
            from auth_memberships_for_user(${userId})`,
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      schoolId: row.school_id,
      schoolName: row.school_name,
      roles: row.roles,
      status: row.status,
    }));
  }

  async invitationByTokenHash(tokenHash: string): Promise<InvitationLookup | null> {
    const result = await this.tenant.tx.execute<InvitationLookupRow>(
      sql`select invitation_id, school_id, roles, phone, email, student_id, expires_at, accepted_at
            from auth_invitation_by_token_hash(${tokenHash})`,
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      invitationId: row.invitation_id,
      schoolId: row.school_id,
      roles: row.roles,
      phone: row.phone,
      email: row.email,
      studentId: row.student_id,
      expiresAt: new Date(row.expires_at),
      acceptedAt: row.accepted_at === null ? null : new Date(row.accepted_at),
    };
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const rows = await this.tenant.tx
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, userId));
    return rows.length > 0;
  }

  async releasePushToken(pushToken: string): Promise<void> {
    await this.tenant.tx.execute(sql`select auth_release_push_token(${pushToken})`);
  }
}

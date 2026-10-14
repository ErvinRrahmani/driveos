import { Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { auditLog } from './schema.js';

export const AUDIT_WRITER = Symbol('platform.AuditWriter');

export interface AuditRecord {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
}

/**
 * Same-transaction service (SPEC §3.4): appends to `audit_log` in the caller's transaction,
 * taking the school, actor and support session from the tenant context.
 */
export interface AuditWriter {
  record(entry: AuditRecord): Promise<void>;
}

export const SUPPORT_SESSION_SETTING = 'app.support_session_id';

@Injectable()
export class PlatformAuditWriter implements AuditWriter {
  constructor(private readonly tenant: TenantContext) {}

  record(entry: AuditRecord): Promise<void> {
    return this.insert(
      entry,
      sql`nullif(current_setting(${SUPPORT_SESSION_SETTING}, true), '')::uuid`,
    );
  }

  recordInSession(sessionId: string, entry: AuditRecord): Promise<void> {
    return this.insert(entry, sql`${sessionId}::uuid`);
  }

  async useSupportSession(sessionId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select set_config(${SUPPORT_SESSION_SETTING}, ${sessionId}, true)`,
    );
  }

  private async insert(entry: AuditRecord, supportSessionId: SQL): Promise<void> {
    const actorUserId = this.tenant.userId;
    if (!actorUserId) throw new Error('An audit entry needs an acting user');
    await this.tenant.tx.insert(auditLog).values({
      schoolId: this.tenant.schoolId,
      actorUserId,
      supportSessionId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      at: new Date(),
    });
  }
}

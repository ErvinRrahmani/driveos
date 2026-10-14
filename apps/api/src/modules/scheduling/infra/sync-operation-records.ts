import { Injectable } from '@nestjs/common';
import type { SyncOp, SyncOpResult } from '@driveos/shared';
import { eq, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { syncOperations } from './schema.js';
import { schoolIdOf } from './tenant.js';

export interface StoredSyncOperation {
  membershipId: string;
  result: unknown;
}

@Injectable()
export class SyncOperationRecords {
  constructor(private readonly tenant: TenantContext) {}

  async lockMember(membershipId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('sync_push'), hashtext(${membershipId}::text))`,
    );
  }

  async find(opId: string): Promise<StoredSyncOperation | undefined> {
    const [row] = await this.tenant.tx
      .select({ membershipId: syncOperations.membershipId, result: syncOperations.result })
      .from(syncOperations)
      .where(eq(syncOperations.opId, opId));
    return row;
  }

  async save(membershipId: string, op: SyncOp, result: SyncOpResult): Promise<void> {
    await this.tenant.tx.insert(syncOperations).values({
      schoolId: schoolIdOf(this.tenant),
      opId: op.opId,
      membershipId,
      type: op.type,
      status: result.status,
      result: { ...result, clientAt: op.clientAt },
      appliedAt: new Date(),
    });
  }
}

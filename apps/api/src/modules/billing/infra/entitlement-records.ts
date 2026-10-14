import type { Entitlement } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { entitlements } from './schema.js';

export function toEntitlement(row: typeof entitlements.$inferSelect): Entitlement {
  return {
    id: row.id,
    kind: row.kind,
    paymentId: row.paymentId,
    grantedAt: row.grantedAt.toISOString(),
  };
}

@Injectable()
export class EntitlementReader {
  constructor(private readonly tenant: TenantContext) {}

  async active(studentId: string): Promise<Entitlement[]> {
    const rows = await this.tenant.tx
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.studentId, studentId),
          isNull(entitlements.consumedAt),
          isNull(entitlements.revokedAt),
        ),
      )
      .orderBy(asc(entitlements.grantedAt), asc(entitlements.id));
    return rows.map(toEntitlement);
  }
}

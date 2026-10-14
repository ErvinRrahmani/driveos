import { sql } from 'drizzle-orm';
import type { TenantContext } from '../tenant/tenant-context.js';

export const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export async function purgeIdempotencyKeys(
  tenant: TenantContext,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS);
  return tenant.runAsSystem(async (tx) => {
    const result = await tx.execute(
      sql`delete from idempotency_keys where created_at < ${cutoff.toISOString()}::timestamptz`,
    );
    return result.rowCount ?? 0;
  });
}

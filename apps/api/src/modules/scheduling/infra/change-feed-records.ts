import type { SyncEntity } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { changeFeed } from './schema.js';
import { schoolIdOf } from './tenant.js';

export type FeedOp = (typeof changeFeed.$inferSelect)['op'];

export interface FeedEntry {
  entity: SyncEntity;
  entityId: string;
  op: FeedOp;
  audience: string | null;
}

export interface FeedRow extends FeedEntry {
  seq: string;
  at: Date;
}

const entryKey = (entry: FeedEntry) =>
  `${entry.entity}/${entry.entityId}/${entry.op}/${entry.audience ?? ''}`;

@Injectable()
export class ChangeFeedRecords {
  constructor(private readonly tenant: TenantContext) {}

  /** Only the change_feed projection may call this: it holds the per-school writer lock. */
  async append(entries: readonly FeedEntry[], at: Date): Promise<void> {
    const unique = [...new Map(entries.map((entry) => [entryKey(entry), entry])).values()];
    if (unique.length === 0) return;
    const schoolId = schoolIdOf(this.tenant);
    await this.tenant.tx.insert(changeFeed).values(
      unique.map((entry) => ({
        schoolId,
        entity: entry.entity,
        entityId: entry.entityId,
        op: entry.op,
        audienceMembershipId: entry.audience,
        at,
      })),
    );
  }

  async after(audience: string, cursor: string, limit: number): Promise<FeedRow[]> {
    const rows = await this.tenant.tx
      .select({
        seq: sql<string>`${changeFeed.seq}::text`,
        entity: changeFeed.entity,
        entityId: changeFeed.entityId,
        op: changeFeed.op,
        audience: changeFeed.audienceMembershipId,
        at: changeFeed.at,
      })
      .from(changeFeed)
      .where(
        and(
          sql`${changeFeed.seq} > ${cursor}::bigint`,
          or(
            isNull(changeFeed.audienceMembershipId),
            eq(changeFeed.audienceMembershipId, audience),
          ),
        ),
      )
      .orderBy(asc(changeFeed.seq))
      .limit(limit);
    return rows.map((row) => ({ ...row, entity: row.entity as SyncEntity }));
  }
}

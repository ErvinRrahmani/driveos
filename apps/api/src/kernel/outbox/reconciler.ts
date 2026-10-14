import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { JobQueues, QUEUES } from '../jobs/queues.js';
import { SubscriberRegistry } from '../subscribers/subscriber-registry.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { eventJob } from './event-job.js';

export const RECONCILE_AFTER_MS = 60 * 60 * 1000;
export const RECONCILE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;

export interface ReconcileResult {
  reenqueued: number;
}

type MissingDelivery = {
  seq: string;
  subscriber: string;
  id: string;
  school_id: string | null;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  actor_user_id: string | null;
  occurred_at: string;
  payload: unknown;
};

@Injectable()
export class DeliveryReconciler {
  private readonly logger = new Logger('DeliveryReconciler');

  constructor(
    private readonly tenant: TenantContext,
    private readonly subscribers: SubscriberRegistry,
    private readonly queues: JobQueues,
  ) {}

  async reconcileOnce(now: Date = new Date()): Promise<ReconcileResult> {
    const pairs = this.subscribers.pairs();
    if (pairs.length === 0) return { reenqueued: 0 };
    const until = new Date(now.getTime() - RECONCILE_AFTER_MS);
    const since = new Date(until.getTime() - RECONCILE_LOOKBACK_MS);
    let cursor = { seq: '0', subscriber: '' };
    let reenqueued = 0;
    for (;;) {
      const page = await this.missing(JSON.stringify(pairs), since, until, cursor);
      if (page.length > 0) {
        await this.queues
          .queue(QUEUES.events)
          .addBulk(page.map((row) => eventJob(row.subscriber, toEvent(row))));
        reenqueued += page.length;
      }
      const last = page.at(-1);
      if (!last || page.length < PAGE_SIZE) break;
      cursor = { seq: last.seq, subscriber: last.subscriber };
    }
    if (reenqueued > 0) {
      this.logger.warn({ msg: 're-enqueued undelivered events', reenqueued });
    }
    return { reenqueued };
  }

  private missing(
    pairs: string,
    since: Date,
    until: Date,
    cursor: { seq: string; subscriber: string },
  ): Promise<MissingDelivery[]> {
    return this.tenant.runAsSystem(async (tx) => {
      const result = await tx.execute<MissingDelivery>(sql`
        select o.seq, s.subscriber, o.id, o.school_id, o.type, o.version, o.aggregate_type,
               o.aggregate_id, o.aggregate_version, o.actor_user_id, o.occurred_at, o.payload
          from outbox o
          join jsonb_to_recordset(${pairs}::jsonb) as s(type text, subscriber text)
            on s.type = o.type
         where o.published_at >= ${since.toISOString()}::timestamptz
           and o.published_at < ${until.toISOString()}::timestamptz
           and (o.seq, s.subscriber) > (${cursor.seq}::bigint, ${cursor.subscriber})
           and not exists (select 1 from event_deliveries d
                            where d.subscriber = s.subscriber and d.event_id = o.id)
           and not exists (select 1 from dead_letters x
                            where x.subscriber = s.subscriber and x.event_id = o.id)
         order by o.seq, s.subscriber
         limit ${PAGE_SIZE}`);
      return result.rows;
    });
  }
}

function toEvent(row: MissingDelivery): DomainEvent {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    schoolId: row.school_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    actorUserId: row.actor_user_id,
    occurredAt: new Date(row.occurred_at),
    payload: row.payload,
  };
}

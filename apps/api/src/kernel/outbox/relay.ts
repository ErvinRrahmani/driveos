import { Injectable } from '@nestjs/common';
import { asc, inArray, isNull, sql } from 'drizzle-orm';
import { JobQueues, QUEUES } from '../jobs/queues.js';
import { outbox } from '../schema.js';
import { SubscriberRegistry } from '../subscribers/subscriber-registry.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { eventFromOutbox, eventJob } from './event-job.js';

export const RELAY_BATCH_SIZE = 100;

export interface RelayResult {
  events: number;
  jobs: number;
}

@Injectable()
export class OutboxRelay {
  constructor(
    private readonly tenant: TenantContext,
    private readonly subscribers: SubscriberRegistry,
    private readonly queues: JobQueues,
  ) {}

  relayOnce(): Promise<RelayResult> {
    return this.tenant.runAsSystem(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.seq))
        .limit(RELAY_BATCH_SIZE)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return { events: 0, jobs: 0 };
      const jobs = rows.flatMap((row) => {
        const event = eventFromOutbox(row);
        return this.subscribers.subscribersFor(event.type).map((name) => eventJob(name, event));
      });
      if (jobs.length > 0) await this.queues.queue(QUEUES.events).addBulk(jobs);
      await tx
        .update(outbox)
        .set({ publishedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          inArray(
            outbox.seq,
            rows.map((row) => row.seq),
          ),
        );
      return { events: rows.length, jobs: jobs.length };
    });
  }

  async relayUntilEmpty(): Promise<RelayResult> {
    const total = { events: 0, jobs: 0 };
    for (;;) {
      const batch = await this.relayOnce();
      total.events += batch.events;
      total.jobs += batch.jobs;
      if (batch.events < RELAY_BATCH_SIZE) return total;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { SubscriberRegistry } from '../subscribers/subscriber-registry.js';
import { TenantContext } from '../tenant/tenant-context.js';
import type { AlertMeasurement } from './alert-probes.js';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriberBacklog {
  constructor(
    private readonly tenant: TenantContext,
    private readonly subscribers: SubscriberRegistry,
  ) {}

  async oldestUndeliveredSeconds(subscriber: string, now: Date): Promise<AlertMeasurement> {
    const types = [...new Set(this.subscribers.get(subscriber).events.map((event) => event.type))];
    const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
    const [oldest] = await this.tenant.runAsSystem(async (tx) => {
      const result = await tx.execute<{ school_id: string | null; occurred_at: string }>(sql`
        select o.school_id, o.occurred_at
          from outbox o
         where o.type in (select jsonb_array_elements_text(${JSON.stringify(types)}::jsonb))
           and o.occurred_at >= ${since}::timestamptz
           and not exists (select 1 from event_deliveries d
                            where d.subscriber = ${subscriber} and d.event_id = o.id)
           and not exists (select 1 from dead_letters x
                            where x.subscriber = ${subscriber} and x.event_id = o.id)
         order by o.occurred_at
         limit 1`);
      return result.rows;
    });
    return {
      value: oldest ? secondsBetween(new Date(oldest.occurred_at), now) : 0,
      schoolId: oldest?.school_id ?? null,
    };
  }
}

export function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

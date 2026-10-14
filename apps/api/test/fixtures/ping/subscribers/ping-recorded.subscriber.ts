import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { EventPayload } from '@driveos/shared';
import type { DomainEvent } from '../../../../src/kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../../src/kernel/subscribers/index.js';
import { TenantContext } from '../../../../src/kernel/tenant/tenant-context.js';
import { PingRecorded } from '../events/ping-recorded.event.js';

type PingRecordedPayload = EventPayload<typeof PingRecorded>;

export interface ReceivedPing {
  eventId: string;
  payload: PingRecordedPayload;
  occurredAt: Date;
  role: string;
  schoolId: string;
  userId: string;
}

@Injectable()
@EventSubscriber({ name: 'ping.recorded-log', events: [PingRecorded] })
export class PingRecordedSubscriber implements EventHandler<PingRecordedPayload> {
  readonly received: ReceivedPing[] = [];

  constructor(private readonly tenant: TenantContext) {}

  async handle(event: DomainEvent<PingRecordedPayload>): Promise<void> {
    const result = await this.tenant.tx.execute<{
      role: string;
      school_id: string;
      user_id: string;
    }>(
      sql`select current_user as role,
        coalesce(current_setting('app.school_id', true), '') as school_id,
        coalesce(current_setting('app.user_id', true), '') as user_id`,
    );
    const [row] = result.rows;
    if (!row) throw new Error('No tenant settings row');
    this.received.push({
      eventId: event.id,
      payload: event.payload,
      occurredAt: event.occurredAt,
      role: row.role,
      schoolId: row.school_id,
      userId: row.user_id,
    });
  }
}

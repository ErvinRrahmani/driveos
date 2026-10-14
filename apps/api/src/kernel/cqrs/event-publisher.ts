import { Injectable } from '@nestjs/common';
import { newId } from '../db/columns.js';
import { outbox } from '../schema.js';
import { TenantContext } from '../tenant/tenant-context.js';
import type { DomainEvent, NewDomainEvent } from './domain-event.js';

@Injectable()
export class EventPublisher {
  constructor(private readonly tenant: TenantContext) {}

  async append(events: readonly NewDomainEvent[]): Promise<DomainEvent[]> {
    if (!this.tenant.active) throw new Error('EventPublisher.append called outside a tenant scope');
    if (events.length === 0) return [];
    const { schoolId, userId } = this.tenant;
    const envelopes = events.map((event): DomainEvent => {
      const { type, version, schema } = event.definition;
      const parsed = schema.safeParse(event.payload);
      if (!parsed.success) {
        throw new Error(`Event ${type} v${version} payload is invalid: ${parsed.error.message}`, {
          cause: parsed.error,
        });
      }
      return {
        id: newId(),
        type,
        version,
        schoolId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
        actorUserId: userId,
        occurredAt: event.occurredAt ?? new Date(),
        payload: parsed.data,
      };
    });
    await this.tenant.tx.insert(outbox).values(envelopes);
    return envelopes;
  }
}

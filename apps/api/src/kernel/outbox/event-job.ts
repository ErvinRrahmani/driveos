import type { JobsOptions } from 'bullmq';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { BOUNDED_EXPONENTIAL } from '../jobs/backoff.js';
import type { outbox } from '../schema.js';

export const EVENT_MAX_ATTEMPTS = 10;

export type EventEnvelopeJson = Omit<DomainEvent, 'occurredAt'> & { occurredAt: string };

export interface EventJobData {
  subscriber: string;
  event: EventEnvelopeJson;
}

export interface EventJob {
  name: string;
  data: EventJobData;
  opts: JobsOptions;
}

export function eventJobId(subscriber: string, eventId: string): string {
  return `${subscriber}/${eventId}`;
}

export function eventJob(subscriber: string, event: DomainEvent): EventJob {
  return {
    name: event.type,
    data: { subscriber, event: { ...event, occurredAt: event.occurredAt.toISOString() } },
    opts: {
      jobId: eventJobId(subscriber, event.id),
      attempts: EVENT_MAX_ATTEMPTS,
      backoff: { type: BOUNDED_EXPONENTIAL },
      removeOnComplete: true,
      removeOnFail: false,
    },
  };
}

export function eventFromJob(data: EventJobData): DomainEvent {
  return { ...data.event, occurredAt: new Date(data.event.occurredAt) };
}

export function eventFromOutbox(row: typeof outbox.$inferSelect): DomainEvent {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    schoolId: row.schoolId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    aggregateVersion: row.aggregateVersion,
    actorUserId: row.actorUserId,
    occurredAt: row.occurredAt,
    payload: row.payload,
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../db/columns.js';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { withLogContext } from '../logging/log-context.js';
import { eventFromJob, type EventJobData } from '../outbox/event-job.js';
import { deadLetters, eventDeliveries } from '../schema.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { SubscriberRegistry } from './subscriber-registry.js';

export interface DeliveryAttempt {
  attempt: number;
  maxAttempts: number;
}

export type DeliveryOutcome = 'delivered' | 'skipped';

@Injectable()
export class EventDelivery {
  private readonly logger = new Logger('EventDelivery');

  constructor(
    private readonly tenant: TenantContext,
    private readonly subscribers: SubscriberRegistry,
  ) {}

  deliver(data: EventJobData, attempt: DeliveryAttempt): Promise<DeliveryOutcome> {
    const event = eventFromJob(data);
    const context = {
      eventId: event.id,
      eventType: event.type,
      subscriber: data.subscriber,
      ...(event.schoolId ? { schoolId: event.schoolId } : {}),
    };
    return withLogContext(context, () => this.deliverEvent(data, event, attempt));
  }

  private async deliverEvent(
    data: EventJobData,
    event: DomainEvent,
    attempt: DeliveryAttempt,
  ): Promise<DeliveryOutcome> {
    try {
      return await this.claimAndHandle(data.subscriber, event, attempt.attempt);
    } catch (error) {
      if (attempt.attempt >= attempt.maxAttempts) {
        await this.deadLetter(data.subscriber, event, attempt.attempt, error);
      }
      throw error;
    }
  }

  private claimAndHandle(
    subscriber: string,
    event: DomainEvent,
    attempt: number,
  ): Promise<DeliveryOutcome> {
    const { handler } = this.subscribers.get(subscriber);
    return this.tenant.runAsSystem(async (claim) => {
      const claimed = await claim
        .insert(eventDeliveries)
        .values({ subscriber, eventId: event.id, deliveredAt: new Date() })
        .onConflictDoNothing()
        .returning({ eventId: eventDeliveries.eventId });
      if (claimed.length === 0) return 'skipped';
      await this.tenant.runInTenant({ schoolId: event.schoolId, userId: null }, () =>
        handler.handle(event, { subscriber, attempt }),
      );
      return 'delivered';
    });
  }

  private async deadLetter(
    subscriber: string,
    event: DomainEvent,
    attempts: number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    await this.tenant.runAsSystem((tx) =>
      tx.insert(deadLetters).values({
        id: newId(),
        subscriber,
        eventId: event.id,
        error: message,
        attempts,
        failedAt: new Date(),
      }),
    );
    this.logger.error({
      alert: 'dead_letter',
      msg: 'event moved to dead_letters',
      subscriber,
      eventId: event.id,
      eventType: event.type,
      schoolId: event.schoolId,
      attempts,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

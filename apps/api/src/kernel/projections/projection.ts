import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { projectionPositions } from '../schema.js';
import type { Delivery, EventHandler } from '../subscribers/event-subscriber.js';
import { TenantContext } from '../tenant/tenant-context.js';

@Injectable()
export abstract class Projection<TPayload = unknown> implements EventHandler<TPayload> {
  protected readonly serializePerSchool: boolean = false;

  constructor(protected readonly tenant: TenantContext) {}

  protected abstract apply(event: DomainEvent<TPayload>, delivery: Delivery): Promise<void>;

  async handle(event: DomainEvent<TPayload>, delivery: Delivery): Promise<void> {
    const { schoolId } = event;
    if (schoolId === null) {
      throw new Error(`Projection ${delivery.subscriber} received ${event.type} without a school`);
    }
    const projection = delivery.subscriber;
    const tx = this.tenant.tx;
    if (this.serializePerSchool) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${projection}), hashtext(${schoolId}))`,
      );
    }
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${projection}/aggregate`}),
        hashtext(${`${event.aggregateType}/${event.aggregateId}`}))`,
    );
    const [current] = await tx
      .select({ version: projectionPositions.aggregateVersion })
      .from(projectionPositions)
      .where(
        and(
          eq(projectionPositions.projection, projection),
          eq(projectionPositions.aggregateType, event.aggregateType),
          eq(projectionPositions.aggregateId, event.aggregateId),
        ),
      );
    if (current && event.aggregateVersion <= current.version) return;
    await this.apply(event, delivery);
    await tx
      .insert(projectionPositions)
      .values({
        schoolId,
        projection,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
      })
      .onConflictDoUpdate({
        target: [
          projectionPositions.projection,
          projectionPositions.aggregateType,
          projectionPositions.aggregateId,
        ],
        set: { aggregateVersion: event.aggregateVersion, updatedAt: sql`now()` },
      });
  }
}

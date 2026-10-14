import { DeviceTokenInvalidated, type EventPayload } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { devices } from '../infra/schema.js';

type Payload = EventPayload<typeof DeviceTokenInvalidated>;

@Injectable()
@EventSubscriber({ name: 'identity.device-token-pruning', events: [DeviceTokenInvalidated] })
export class DeviceTokenInvalidatedSubscriber implements EventHandler<Payload> {
  constructor(private readonly tenant: TenantContext) {}

  async handle({ payload, occurredAt }: DomainEvent<Payload>): Promise<void> {
    await this.tenant.tx
      .delete(devices)
      .where(
        and(
          eq(devices.id, payload.deviceId),
          eq(devices.userId, payload.userId),
          lte(devices.lastSeenAt, occurredAt),
        ),
      );
  }
}

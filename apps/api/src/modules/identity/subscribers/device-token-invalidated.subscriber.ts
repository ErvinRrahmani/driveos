import { DeviceTokenInvalidated, type EventPayload } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';

type Payload = EventPayload<typeof DeviceTokenInvalidated>;

@Injectable()
@EventSubscriber({ name: 'identity.device-token-pruning', events: [DeviceTokenInvalidated] })
export class DeviceTokenInvalidatedSubscriber implements EventHandler<Payload> {
  constructor(private readonly tenant: TenantContext) {}

  /**
   * Deletes the device through `auth_prune_device`: only when id and user match, the device was
   * not seen after the event, and the user is a member of the current school.
   */
  async handle({ payload, occurredAt }: DomainEvent<Payload>): Promise<void> {
    await this.tenant.tx.execute(
      sql`select auth_prune_device(${payload.deviceId}::uuid, ${payload.userId}::uuid, ${occurredAt}::timestamptz)`,
    );
  }
}

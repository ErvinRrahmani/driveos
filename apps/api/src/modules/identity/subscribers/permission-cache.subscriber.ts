import { Injectable } from '@nestjs/common';
import { type EventPayload, MembershipPermissionsChanged } from '@driveos/shared';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { PermissionGrantsCache } from '../infra/permission-grants.cache.js';

type Payload = EventPayload<typeof MembershipPermissionsChanged>;

@Injectable()
@EventSubscriber({ name: 'identity.permission-cache', events: [MembershipPermissionsChanged] })
export class PermissionCacheSubscriber implements EventHandler<Payload> {
  constructor(private readonly cache: PermissionGrantsCache) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    await this.cache.invalidate(event.payload.schoolId, event.payload.membershipId);
  }
}

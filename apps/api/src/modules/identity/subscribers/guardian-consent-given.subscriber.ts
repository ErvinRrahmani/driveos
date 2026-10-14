import { Injectable } from '@nestjs/common';
import { type EventPayload, GuardianConsentGiven } from '@driveos/shared';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { MembershipsRepository } from '../infra/memberships.repository.js';

type Payload = EventPayload<typeof GuardianConsentGiven>;

@Injectable()
@EventSubscriber({ name: 'identity.guardian-consent', events: [GuardianConsentGiven] })
export class GuardianConsentGivenSubscriber implements EventHandler<Payload> {
  constructor(private readonly memberships: MembershipsRepository) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const { studentUserId } = event.payload;
    if (!studentUserId) return;
    const membership = await this.memberships.lockByUser(studentUserId);
    if (membership?.status !== 'pending_consent') return;
    await this.memberships.update(membership.id, {
      roles: membership.roles,
      status: 'active',
      version: membership.version + 1,
    });
  }
}

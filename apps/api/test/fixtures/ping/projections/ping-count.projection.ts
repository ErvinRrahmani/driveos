import { Injectable } from '@nestjs/common';
import type { EventPayload } from '@driveos/shared';
import type { DomainEvent } from '../../../../src/kernel/cqrs/index.js';
import { Projection } from '../../../../src/kernel/projections/index.js';
import { EventSubscriber } from '../../../../src/kernel/subscribers/index.js';
import { PingRecorded } from '../events/ping-recorded.event.js';

type PingRecordedPayload = EventPayload<typeof PingRecorded>;

@Injectable()
@EventSubscriber({ name: 'ping.count', events: [PingRecorded] })
export class PingCountProjection extends Projection<PingRecordedPayload> {
  readonly applied: DomainEvent<PingRecordedPayload>[] = [];

  protected async apply(event: DomainEvent<PingRecordedPayload>): Promise<void> {
    this.applied.push(event);
  }
}

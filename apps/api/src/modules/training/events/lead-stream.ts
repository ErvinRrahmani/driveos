import type { EventDefinition } from '@driveos/shared';
import type { z } from 'zod';
import { newEvent, type NewDomainEvent } from '../../../kernel/cqrs/index.js';

export const LEAD_AGGREGATE = 'lead';

/**
 * Events of one lead. The aggregate version is `leads.version`: a note-only change bumps the row
 * version without an event, so a lead's event versions can have gaps.
 */
export class LeadStream {
  readonly events: NewDomainEvent[] = [];

  constructor(
    readonly leadId: string,
    private current: number,
  ) {}

  get version(): number {
    return this.current;
  }

  /** A change without an event (staff note). */
  bump(): void {
    this.current += 1;
  }

  add<D extends EventDefinition>(definition: D, payload: z.input<D['schema']>): void {
    this.current += 1;
    this.events.push(
      newEvent(definition, {
        aggregateType: LEAD_AGGREGATE,
        aggregateId: this.leadId,
        aggregateVersion: this.current,
        payload,
      }),
    );
  }
}

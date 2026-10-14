import type { EventDefinition } from '@driveos/shared';
import type { z } from 'zod';
import { newEvent, type NewDomainEvent } from '../../../kernel/cqrs/index.js';

export const STUDENT_AGGREGATE = 'student';

export class StudentStream {
  readonly events: NewDomainEvent[] = [];

  constructor(
    readonly studentId: string,
    private current: number,
  ) {}

  get version(): number {
    return this.current;
  }

  add<D extends EventDefinition>(definition: D, payload: z.input<D['schema']>): void {
    this.current += 1;
    this.events.push(
      newEvent(definition, {
        aggregateType: STUDENT_AGGREGATE,
        aggregateId: this.studentId,
        aggregateVersion: this.current,
        payload,
      }),
    );
  }
}

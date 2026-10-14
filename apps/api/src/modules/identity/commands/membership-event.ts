import type { EventDefinition } from '@driveos/shared';
import type { z } from 'zod';
import { newEvent, type NewDomainEvent } from '../../../kernel/cqrs/index.js';

export const MEMBERSHIP_AGGREGATE = 'membership';

export function membershipEvent<D extends EventDefinition>(
  definition: D,
  membershipId: string,
  version: number,
  payload: z.input<D['schema']>,
): NewDomainEvent<D> {
  return newEvent(definition, {
    aggregateType: MEMBERSHIP_AGGREGATE,
    aggregateId: membershipId,
    aggregateVersion: version,
    payload,
  });
}

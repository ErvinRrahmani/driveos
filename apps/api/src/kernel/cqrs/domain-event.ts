import type { EventDefinition } from '@driveos/shared';
import type { z } from 'zod';

export interface DomainEvent<TPayload = unknown> {
  id: string;
  type: string;
  version: number;
  schoolId: string | null;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  actorUserId: string | null;
  occurredAt: Date;
  payload: TPayload;
}

export interface NewDomainEvent<TDefinition extends EventDefinition = EventDefinition> {
  definition: TDefinition;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: z.input<TDefinition['schema']>;
  occurredAt?: Date;
}

export function newEvent<TDefinition extends EventDefinition>(
  definition: TDefinition,
  fields: Omit<NewDomainEvent<TDefinition>, 'definition'>,
): NewDomainEvent<TDefinition> {
  return { definition, ...fields };
}

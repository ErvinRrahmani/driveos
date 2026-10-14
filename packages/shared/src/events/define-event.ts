import type { z } from 'zod';

export interface EventDefinition<
  TType extends string = string,
  TSchema extends z.ZodType = z.ZodType,
> {
  readonly type: TType;
  readonly version: number;
  readonly schema: TSchema;
}

export type EventPayload<TDefinition extends EventDefinition> = z.output<TDefinition['schema']>;

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

export function defineEvent<const TType extends string, TSchema extends z.ZodType>(definition: {
  type: TType;
  version: number;
  schema: TSchema;
}): EventDefinition<TType, TSchema> {
  if (!PASCAL_CASE.test(definition.type)) {
    throw new Error(`Event type "${definition.type}" must be PascalCase`);
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`Event ${definition.type} version must be a positive integer`);
  }
  return Object.freeze({ ...definition });
}

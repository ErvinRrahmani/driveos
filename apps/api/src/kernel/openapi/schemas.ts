import * as shared from '@driveos/shared';
import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';

type Shared = typeof shared;

type SchemaExport = {
  [K in keyof Shared]: K extends `${string}Schema`
    ? Shared[K] extends z.ZodType
      ? K
      : never
    : never;
}[keyof Shared];

export type SchemaName = SchemaExport extends `${infer Name}Schema` ? Capitalize<Name> : never;

export type SchemaObject = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];

const INPUT_SCHEMA = /(Request|Query|Params)$/;
const INPUT_WITHOUT_SUFFIX: ReadonlySet<string> = new Set(['FakePaymentWebhookEvent']);

function componentName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1, -'Schema'.length);
}

const registry: ReadonlyMap<string, z.ZodType> = new Map(
  Object.entries(shared).flatMap(([key, value]) =>
    key.endsWith('Schema') && value instanceof z.ZodType
      ? [[componentName(key), value as z.ZodType] as const]
      : [],
  ),
);

function ioOf(name: string): 'input' | 'output' {
  return INPUT_SCHEMA.test(name) || INPUT_WITHOUT_SUFFIX.has(name) ? 'input' : 'output';
}

export function dtoSchema(name: SchemaName): z.ZodType {
  const schema = registry.get(name);
  if (!schema) throw new Error(`No shared DTO schema named ${name}`);
  return schema;
}

export function jsonSchemaOf(name: SchemaName): SchemaObject {
  return toSchema(dtoSchema(name), ioOf(name));
}

export function schemaRef(name: SchemaName): { $ref: string } {
  dtoSchema(name);
  return { $ref: `#/components/schemas/${name}` };
}

function toSchema(schema: z.ZodType, io: 'input' | 'output'): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as SchemaObject;
}

export function componentSchemas(): Record<string, SchemaObject> {
  return Object.fromEntries(
    [...registry].map(([name, schema]) => [name, toSchema(schema, ioOf(name))]),
  );
}

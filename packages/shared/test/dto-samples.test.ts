import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as billing from '../src/dto/billing.js';
import * as documents from '../src/dto/documents.js';
import * as messaging from '../src/dto/messaging.js';
import * as platform from '../src/dto/platform.js';
import * as reporting from '../src/dto/reporting.js';
import * as scheduling from '../src/dto/scheduling.js';
import * as school from '../src/dto/school.js';
import * as theory from '../src/dto/theory.js';
import * as training from '../src/dto/training.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';
import * as shared from '../src/index.js';

const MODULES = {
  school,
  platform,
  scheduling,
  training,
  theory,
  billing,
  documents,
  messaging,
  reporting,
} as const;

function schemasOf(module: Record<string, unknown>): [string, z.ZodType][] {
  return Object.entries(module)
    .filter(
      (entry): entry is [string, z.ZodType] =>
        entry[0].endsWith('Schema') && entry[1] instanceof z.ZodType,
    )
    .map(([name, schema]) => [name.slice(0, -'Schema'.length), schema]);
}

describe.each(Object.entries(MODULES))('%s DTOs', (moduleName, module) => {
  const schemas = schemasOf(module);
  const samples: Record<string, unknown> = DTO_SAMPLES[moduleName as keyof typeof MODULES];

  it('exports schemas', () => {
    expect(schemas.length).toBeGreaterThan(0);
  });

  it('has exactly one sample per exported schema', () => {
    expect(Object.keys(samples).sort()).toEqual(schemas.map(([name]) => name).sort());
  });

  it.each(schemas)('%s parses its sample unchanged', (name, schema) => {
    const sample = samples[name];
    expect(sample).toBeDefined();
    expect(schema.parse(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  it.each(schemas)('%s converts to an OpenAPI 3.0 JSON Schema', (_name, schema) => {
    for (const io of ['input', 'output'] as const) {
      expect(() => z.toJSONSchema(schema, { target: 'openapi-3.0', io })).not.toThrow();
    }
  });

  it.each(schemas)('%s is exported from the package root', (name, schema) => {
    expect((shared as Record<string, unknown>)[`${name}Schema`]).toBe(schema);
  });
});

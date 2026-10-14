import { describe, expect, it } from 'vitest';
import { errorResponseSchema, healthResponseSchema } from '../src/index.js';

describe('healthResponseSchema', () => {
  it('accepts an ok health payload', () => {
    const parsed = healthResponseSchema.parse({ status: 'ok', service: 'api' });
    expect(parsed).toEqual({ status: 'ok', service: 'api' });
  });

  it('rejects an unknown status', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', service: 'api' }).success).toBe(false);
  });
});

describe('errorResponseSchema', () => {
  it('accepts the CLAUDE.md error envelope with optional details', () => {
    expect(
      errorResponseSchema.safeParse({ error: { code: 'not_found', message: 'Not found.' } })
        .success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({ code: 'not_found', message: 'Not found.' }).success,
    ).toBe(false);
  });
});

import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineEvent, type EventPayload } from '../src/index.js';

describe('defineEvent', () => {
  const SomethingHappened = defineEvent({
    type: 'SomethingHappened',
    version: 2,
    schema: z.object({ amount: z.number().int() }),
  });

  it('keeps the type literal, the integer version and the payload schema', () => {
    expect(SomethingHappened.type).toBe('SomethingHappened');
    expect(SomethingHappened.version).toBe(2);
    expect(SomethingHappened.schema.parse({ amount: 3 })).toEqual({ amount: 3 });
    expectTypeOf(SomethingHappened.type).toEqualTypeOf<'SomethingHappened'>();
    expectTypeOf<EventPayload<typeof SomethingHappened>>().toEqualTypeOf<{ amount: number }>();
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SomethingHappened)).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects version %s', (version) => {
    expect(() => defineEvent({ type: 'Bad', version, schema: z.object({}) })).toThrow(
      /positive integer/,
    );
  });

  it('rejects a type that is not PascalCase', () => {
    expect(() =>
      defineEvent({ type: 'something_happened', version: 1, schema: z.object({}) }),
    ).toThrow(/PascalCase/);
  });
});

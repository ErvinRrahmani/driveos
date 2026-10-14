import { describe, expect, it } from 'vitest';
import { parseTstzRange, serializeTstzRange } from '../../src/kernel/db/tstzrange.js';

describe('tstzrange codec', () => {
  it('serializes a period as a half-open UTC range', () => {
    expect(
      serializeTstzRange({
        start: new Date('2026-01-05T10:00:00Z'),
        end: new Date('2026-01-05T11:00:00Z'),
      }),
    ).toBe('[2026-01-05T10:00:00.000Z,2026-01-05T11:00:00.000Z)');
  });

  it('parses the range text Postgres returns', () => {
    const period = parseTstzRange('["2026-01-05 10:00:00+00","2026-01-05 11:30:00+00")');
    expect(period.start.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-01-05T11:30:00.000Z');
  });

  it('parses fractional seconds and non-UTC offsets', () => {
    const period = parseTstzRange('["2026-01-05 10:00:00.25+02","2026-01-05 11:00:00+05:30")');
    expect(period.start.toISOString()).toBe('2026-01-05T08:00:00.250Z');
    expect(period.end.toISOString()).toBe('2026-01-05T05:30:00.000Z');
  });

  it('rejects ranges that are not half-open with both bounds', () => {
    expect(() => parseTstzRange('empty')).toThrow(/tstzrange/);
    expect(() => parseTstzRange('["2026-01-05 10:00:00+00",)')).toThrow(/tstzrange/);
    expect(() => parseTstzRange('["2026-01-05 10:00:00+00","2026-01-05 11:00:00+00"]')).toThrow(
      /tstzrange/,
    );
  });

  it('refuses to serialize an empty or inverted period', () => {
    const at = new Date('2026-01-05T10:00:00Z');
    expect(() => serializeTstzRange({ start: at, end: at })).toThrow(/tstzrange/);
  });
});

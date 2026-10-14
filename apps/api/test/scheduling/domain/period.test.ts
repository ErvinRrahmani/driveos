import { describe, expect, it } from 'vitest';
import { satisfiesMinGap } from '../../../src/modules/scheduling/domain/gap.js';
import {
  formatRange,
  overlaps,
  parseRange,
  type Period,
  subtractPeriods,
} from '../../../src/modules/scheduling/domain/period.js';

const at = (time: string) => new Date(`2026-10-12T${time}:00.000Z`);
const period = (start: string, end: string): Period => ({ start: at(start), end: at(end) });

describe('period text', () => {
  it('formats a half-open tstzrange literal', () => {
    expect(formatRange(period('08:00', '09:00'))).toBe(
      '[2026-10-12T08:00:00.000Z,2026-10-12T09:00:00.000Z)',
    );
  });

  it('parses the Postgres text form of a tstzrange', () => {
    expect(parseRange('["2026-10-12 08:00:00+00","2026-10-12 09:30:00+00")')).toEqual(
      period('08:00', '09:30'),
    );
    expect(parseRange('["2026-10-12 10:00:00+02","2026-10-12 11:00:00.5+02")')).toEqual({
      start: at('08:00'),
      end: new Date('2026-10-12T09:00:00.500Z'),
    });
  });

  it('round-trips its own format', () => {
    const value = period('06:15', '07:00');
    expect(parseRange(formatRange(value))).toEqual(value);
  });

  it('rejects text that is not a bounded half-open range', () => {
    expect(() => parseRange('(,)')).toThrow();
    expect(() => parseRange('[2026-10-12 08:00:00+00,2026-10-12 09:00:00+00]')).toThrow();
  });
});

describe('overlaps', () => {
  it('treats touching half-open periods as not overlapping', () => {
    expect(overlaps(period('08:00', '09:00'), period('09:00', '10:00'))).toBe(false);
    expect(overlaps(period('08:00', '09:01'), period('09:00', '10:00'))).toBe(true);
  });
});

describe('subtractPeriods', () => {
  it('cuts holes out of a period and drops the empty pieces', () => {
    expect(
      subtractPeriods(period('08:00', '17:00'), [
        period('10:00', '11:00'),
        period('07:00', '08:30'),
        period('16:00', '18:00'),
      ]),
    ).toEqual([period('08:30', '10:00'), period('11:00', '16:00')]);
  });

  it('returns nothing when a cut covers the whole period', () => {
    expect(subtractPeriods(period('08:00', '09:00'), [period('07:00', '10:00')])).toEqual([]);
  });
});

describe('satisfiesMinGap', () => {
  const busy = [period('10:00', '11:00')];

  it('without a gap only forbids overlaps (back-to-back is fine)', () => {
    expect(satisfiesMinGap(period('11:00', '12:00'), busy, 0)).toBe(true);
    expect(satisfiesMinGap(period('09:00', '10:00'), busy, 0)).toBe(true);
    expect(satisfiesMinGap(period('10:30', '11:30'), busy, 0)).toBe(false);
  });

  it('requires the gap before and after each busy period', () => {
    expect(satisfiesMinGap(period('11:00', '12:00'), busy, 15)).toBe(false);
    expect(satisfiesMinGap(period('11:15', '12:15'), busy, 15)).toBe(true);
    expect(satisfiesMinGap(period('08:45', '09:45'), busy, 15)).toBe(true);
    expect(satisfiesMinGap(period('08:50', '09:50'), busy, 15)).toBe(false);
  });
});

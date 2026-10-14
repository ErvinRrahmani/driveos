import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMinutes,
  isoWeekday,
  parseMinutes,
  startOfIsoWeek,
  todayIn,
  zonedParts,
  zonedToUtc,
} from '../../src/lib/zoned-time';

const BERLIN = 'Europe/Berlin';

describe('plain date arithmetic', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('finds the ISO weekday and the Monday of the week', () => {
    expect(isoWeekday('2026-10-11')).toBe(7);
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(startOfIsoWeek('2026-10-08')).toBe('2026-10-05');
    expect(startOfIsoWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfIsoWeek('2026-10-12')).toBe('2026-10-12');
  });

  it('formats and parses minutes of the day', () => {
    expect(formatMinutes(9 * 60 + 5)).toBe('09:05');
    expect(parseMinutes('22:30')).toBe(1350);
  });
});

describe('zoned conversions', () => {
  it('reads the wall clock of an instant in the school time zone', () => {
    expect(zonedParts('2026-10-12T07:00:00.000Z', BERLIN)).toEqual({
      date: '2026-10-12',
      minutes: 9 * 60,
    });
    expect(zonedParts('2026-12-31T23:30:00.000Z', BERLIN)).toEqual({
      date: '2027-01-01',
      minutes: 30,
    });
  });

  it('turns a wall-clock time into an instant in summer and winter time', () => {
    expect(zonedToUtc('2026-10-12', 9 * 60, BERLIN)).toBe('2026-10-12T07:00:00.000Z');
    expect(zonedToUtc('2026-11-02', 9 * 60, BERLIN)).toBe('2026-11-02T08:00:00.000Z');
  });

  it('handles the day DST ends (25-hour day) and midnight', () => {
    expect(zonedToUtc('2026-10-25', 0, BERLIN)).toBe('2026-10-24T22:00:00.000Z');
    expect(zonedToUtc('2026-10-25', 12 * 60, BERLIN)).toBe('2026-10-25T11:00:00.000Z');
  });

  it('resolves the repeated hour to its first occurrence', () => {
    expect(zonedToUtc('2026-10-25', 2 * 60 + 30, BERLIN)).toBe('2026-10-25T00:30:00.000Z');
  });

  it('gives today in the school time zone', () => {
    expect(todayIn(BERLIN, new Date('2026-10-08T22:30:00Z'))).toBe('2026-10-09');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addDays,
  isoWeekday,
  localDateOf,
  localToUtc,
  localToUtcOrTransition,
} from '../../../src/modules/scheduling/domain/time-zone.js';

const BERLIN = 'Europe/Berlin';

describe('localToUtc', () => {
  it('converts a winter wall-clock time in Berlin (UTC+1)', () => {
    expect(localToUtc('2026-01-12', '09:00', BERLIN)?.toISOString()).toBe(
      '2026-01-12T08:00:00.000Z',
    );
  });

  it('converts a summer wall-clock time in Berlin (UTC+2)', () => {
    expect(localToUtc('2026-07-13', '09:00', BERLIN)?.toISOString()).toBe(
      '2026-07-13T07:00:00.000Z',
    );
  });

  it('returns null for a time in the spring-forward gap (2026-03-29 02:30 does not exist)', () => {
    expect(localToUtc('2026-03-29', '02:30', BERLIN)).toBeNull();
    expect(localToUtc('2026-03-29', '02:00', BERLIN)).toBeNull();
  });

  it('accepts the first valid minute after the gap', () => {
    expect(localToUtc('2026-03-29', '03:00', BERLIN)?.toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
    expect(localToUtc('2026-03-29', '01:59', BERLIN)?.toISOString()).toBe(
      '2026-03-29T00:59:00.000Z',
    );
  });

  it('resolves the fall-back ambiguity to the first occurrence (2026-10-25 02:30 CEST)', () => {
    expect(localToUtc('2026-10-25', '02:30', BERLIN)?.toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('works for a zone west of UTC across its own DST change (America/New_York)', () => {
    expect(localToUtc('2026-03-08', '02:30', 'America/New_York')).toBeNull();
    expect(localToUtc('2026-11-01', '01:30', 'America/New_York')?.toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('handles a zone with a quarter-hour offset (Asia/Kathmandu, UTC+5:45)', () => {
    expect(localToUtc('2026-10-12', '09:00', 'Asia/Kathmandu')?.toISOString()).toBe(
      '2026-10-12T03:15:00.000Z',
    );
  });
});

describe('localToUtcOrTransition', () => {
  it('snaps a time in the spring-forward gap to the transition instant (03:00 CEST)', () => {
    expect(localToUtcOrTransition('2026-03-29', '02:30', BERLIN).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('returns the exact instant for a valid time', () => {
    expect(localToUtcOrTransition('2026-03-29', '09:00', BERLIN).toISOString()).toBe(
      '2026-03-29T07:00:00.000Z',
    );
  });
});

describe('calendar helpers', () => {
  it('gives the local date of an instant in the zone', () => {
    expect(localDateOf(new Date('2026-10-11T22:30:00Z'), BERLIN)).toBe('2026-10-12');
    expect(localDateOf(new Date('2026-10-11T21:30:00Z'), BERLIN)).toBe('2026-10-11');
  });

  it('gives the ISO weekday of a date (Monday = 1, Sunday = 7)', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('adds calendar days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isoWeekday,
  localDayOf,
  localToUtc,
  periodOf,
  periodsBetween,
} from '../../../src/modules/reporting/domain/buckets.js';

const BERLIN = 'Europe/Berlin';
const LISBON = 'Europe/Lisbon';
const NEW_YORK = 'America/New_York';

describe('localDayOf', () => {
  it('puts 23:30 local on the last day of a month on that day, not the next month', () => {
    expect(localDayOf(new Date('2026-10-31T22:30:00Z'), BERLIN)).toBe('2026-10-31');
    expect(localDayOf(new Date('2026-09-30T21:30:00Z'), BERLIN)).toBe('2026-09-30');
    expect(localDayOf(new Date('2026-12-31T22:30:00Z'), BERLIN)).toBe('2026-12-31');
  });

  it('moves an instant after local midnight to the next day even when UTC is still on the previous one', () => {
    expect(localDayOf(new Date('2026-10-31T23:30:00Z'), BERLIN)).toBe('2026-11-01');
    expect(localDayOf(new Date('2026-06-30T22:15:00Z'), BERLIN)).toBe('2026-07-01');
  });

  it('keeps a late evening on the previous day for zones behind UTC', () => {
    expect(localDayOf(new Date('2026-11-01T03:30:00Z'), NEW_YORK)).toBe('2026-10-31');
  });

  it('uses the zone offset of the instant on DST change days', () => {
    expect(localDayOf(new Date('2026-03-28T23:30:00Z'), BERLIN)).toBe('2026-03-29');
    expect(localDayOf(new Date('2026-03-29T21:59:00Z'), BERLIN)).toBe('2026-03-29');
    expect(localDayOf(new Date('2026-03-29T22:00:00Z'), BERLIN)).toBe('2026-03-30');
    expect(localDayOf(new Date('2026-10-24T22:00:00Z'), BERLIN)).toBe('2026-10-25');
    expect(localDayOf(new Date('2026-10-25T22:59:00Z'), BERLIN)).toBe('2026-10-25');
    expect(localDayOf(new Date('2026-10-25T23:00:00Z'), BERLIN)).toBe('2026-10-26');
    expect(localDayOf(new Date('2026-10-25T23:30:00Z'), LISBON)).toBe('2026-10-25');
  });
});

describe('localToUtc', () => {
  it('converts a local wall-clock time to the instant', () => {
    expect(localToUtc('2026-07-01', '09:00', BERLIN).toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    expect(localToUtc('2026-12-01', '09:00', BERLIN).toISOString()).toBe(
      '2026-12-01T08:00:00.000Z',
    );
  });

  it('maps a time skipped by the spring-forward gap to the transition', () => {
    expect(localToUtc('2026-03-29', '02:30', BERLIN).toISOString()).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('gives a 23-hour and a 25-hour day on DST changes', () => {
    const spring = localToUtc('2026-03-30', '00:00', BERLIN).getTime();
    const springStart = localToUtc('2026-03-29', '00:00', BERLIN).getTime();
    expect((spring - springStart) / 3_600_000).toBe(23);
    const autumn = localToUtc('2026-10-26', '00:00', BERLIN).getTime();
    const autumnStart = localToUtc('2026-10-25', '00:00', BERLIN).getTime();
    expect((autumn - autumnStart) / 3_600_000).toBe(25);
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists the days of a range inclusively', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(daysBetween('2026-10-30', '2026-10-30')).toEqual(['2026-10-30']);
  });

  it('numbers ISO weekdays Monday = 1 to Sunday = 7', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });
});

describe('periods', () => {
  it('labels a day by itself, its ISO week by the Monday and its month by the first', () => {
    expect(periodOf('2026-10-15', 'day')).toBe('2026-10-15');
    expect(periodOf('2026-10-15', 'week')).toBe('2026-10-12');
    expect(periodOf('2026-10-18', 'week')).toBe('2026-10-12');
    expect(periodOf('2026-10-15', 'month')).toBe('2026-10-01');
  });

  it('lists every period touched by a range in order', () => {
    expect(periodsBetween('2026-10-30', '2026-11-02', 'day')).toHaveLength(4);
    expect(periodsBetween('2026-10-28', '2026-11-10', 'week')).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    expect(periodsBetween('2026-09-15', '2026-11-01', 'month')).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ]);
  });
});

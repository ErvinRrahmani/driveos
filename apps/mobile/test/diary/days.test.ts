import { describe, expect, it } from 'vitest';
import { addDays, dayRange, todayIn, weekOf } from '../../src/lib/diary/days';

describe('diary days', () => {
  it('finds today in the school time zone', () => {
    const lateEvening = new Date('2026-10-11T22:30:00.000Z');
    expect(todayIn(lateEvening, 'Europe/Berlin')).toBe('2026-10-12');
    expect(todayIn(lateEvening, 'America/New_York')).toBe('2026-10-11');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('turns a local day into a UTC range', () => {
    expect(dayRange('2026-10-12', 'Europe/Berlin')).toEqual({
      from: '2026-10-11T22:00:00.000Z',
      to: '2026-10-12T22:00:00.000Z',
    });
    expect(dayRange('2026-10-12', 'UTC')).toEqual({
      from: '2026-10-12T00:00:00.000Z',
      to: '2026-10-13T00:00:00.000Z',
    });
  });

  it('handles the daylight saving switch', () => {
    expect(dayRange('2026-10-25', 'Europe/Berlin')).toEqual({
      from: '2026-10-24T22:00:00.000Z',
      to: '2026-10-25T23:00:00.000Z',
    });
  });

  it('lists the Monday-to-Sunday week of a day', () => {
    expect(weekOf('2026-10-14')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(weekOf('2026-10-18')[0]).toBe('2026-10-12');
  });
});

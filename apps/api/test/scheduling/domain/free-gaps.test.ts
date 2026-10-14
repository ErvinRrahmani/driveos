import { describe, expect, it } from 'vitest';
import { findGaps } from '../../../src/modules/scheduling/domain/free-gaps.js';

const INGO = 'ingo';
const INA = 'ina';
const at = (time: string) => new Date(`2026-10-13T${time}:00.000Z`);
const period = (start: string, end: string) => ({ start: at(start), end: at(end) });
const window = (instructorMembershipId: string, start: string, end: string) => ({
  instructorMembershipId,
  ...period(start, end),
});
const times = (gaps: { start: Date; end: Date }[]) =>
  gaps.map(
    (gap) => `${gap.start.toISOString().slice(11, 16)}-${gap.end.toISOString().slice(11, 16)}`,
  );

describe('findGaps', () => {
  it('returns the free parts of a window between booked lessons', () => {
    const gaps = findGaps({
      windows: [window(INGO, '08:00', '17:00')],
      instructorBusy: new Map([[INGO, [period('09:00', '10:00'), period('12:00', '13:00')]]]),
      minMinutes: 60,
      minGapMinutes: 0,
    });
    expect(times(gaps)).toEqual(['08:00-09:00', '10:00-12:00', '13:00-17:00']);
    expect(gaps[0]).toMatchObject({ instructorMembershipId: INGO });
  });

  it('drops gaps shorter than the shortest lesson', () => {
    const gaps = findGaps({
      windows: [window(INGO, '09:00', '13:00')],
      instructorBusy: new Map([[INGO, [period('09:00', '10:00'), period('10:45', '13:00')]]]),
      minMinutes: 60,
      minGapMinutes: 0,
    });
    expect(gaps).toEqual([]);
  });

  it('keeps the minimum gap clear around booked lessons', () => {
    const gaps = findGaps({
      windows: [window(INGO, '09:00', '13:00')],
      instructorBusy: new Map([[INGO, [period('09:00', '10:00'), period('12:00', '13:00')]]]),
      minMinutes: 60,
      minGapMinutes: 15,
    });
    expect(times(gaps)).toEqual(['10:15-11:45']);
  });

  it('starts no earlier than notBefore, on the 15-minute grid', () => {
    const gaps = findGaps({
      windows: [window(INGO, '08:00', '12:00')],
      instructorBusy: new Map(),
      minMinutes: 60,
      minGapMinutes: 0,
      notBefore: at('09:07'),
    });
    expect(times(gaps)).toEqual(['09:15-12:00']);
  });

  it('merges touching windows of one instructor and sorts by start then instructor', () => {
    const gaps = findGaps({
      windows: [
        window(INA, '10:00', '12:00'),
        window(INGO, '10:00', '11:00'),
        window(INGO, '11:00', '12:00'),
        window(INGO, '08:00', '08:30'),
      ],
      instructorBusy: new Map(),
      minMinutes: 90,
      minGapMinutes: 0,
    });
    expect(gaps.map((gap) => [gap.instructorMembershipId, ...times([gap])])).toEqual([
      [INA, '10:00-12:00'],
      [INGO, '10:00-12:00'],
    ]);
  });
});

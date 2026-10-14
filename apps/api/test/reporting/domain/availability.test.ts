import { describe, expect, it } from 'vitest';
import { availableMinutesByDay } from '../../../src/modules/reporting/domain/availability.js';

const BERLIN = 'Europe/Berlin';
const INGO = '0192f000-0003-7000-8000-000000000003';
const INA = '0192f000-0003-7000-8000-000000000099';

const weekdays = (startTime: string, endTime: string) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime, endTime }));

describe('availableMinutesByDay', () => {
  it('sums the weekly windows valid on each local day', () => {
    const minutes = availableMinutesByDay({
      layers: [
        {
          instructorMembershipId: INGO,
          version: 1,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          windows: weekdays('09:00', '17:00'),
        },
      ],
      timeOff: [],
      from: '2026-10-16',
      to: '2026-10-19',
      zone: BERLIN,
    });
    expect(Object.fromEntries(minutes)).toEqual({
      '2026-10-16': 480,
      '2026-10-17': 0,
      '2026-10-18': 0,
      '2026-10-19': 480,
    });
  });

  it('lets the latest change win inside its range and keeps older patterns outside it', () => {
    const minutes = availableMinutesByDay({
      layers: [
        {
          instructorMembershipId: INGO,
          version: 1,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          windows: weekdays('09:00', '17:00'),
        },
        {
          instructorMembershipId: INGO,
          version: 2,
          effectiveFrom: '2026-10-13',
          effectiveTo: '2026-10-14',
          windows: [{ weekday: 2, startTime: '10:00', endTime: '12:00' }],
        },
      ],
      timeOff: [],
      from: '2026-10-12',
      to: '2026-10-15',
      zone: BERLIN,
    });
    expect([...minutes.values()]).toEqual([480, 120, 0, 480]);
  });

  it('adds instructors together and subtracts time off', () => {
    const minutes = availableMinutesByDay({
      layers: [
        {
          instructorMembershipId: INGO,
          version: 1,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          windows: weekdays('09:00', '17:00'),
        },
        {
          instructorMembershipId: INA,
          version: 1,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          windows: weekdays('08:00', '10:00'),
        },
      ],
      timeOff: [
        {
          instructorMembershipId: INGO,
          start: new Date('2026-10-12T10:00:00Z'),
          end: new Date('2026-10-13T08:00:00Z'),
        },
      ],
      from: '2026-10-12',
      to: '2026-10-13',
      zone: BERLIN,
    });
    expect(Object.fromEntries(minutes)).toEqual({
      '2026-10-12': 180 + 120,
      '2026-10-13': 420 + 120,
    });
  });

  it('measures windows on DST days in real minutes', () => {
    const minutes = availableMinutesByDay({
      layers: [
        {
          instructorMembershipId: INGO,
          version: 1,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          windows: [{ weekday: 7, startTime: '01:00', endTime: '04:00' }],
        },
      ],
      timeOff: [],
      from: '2026-03-29',
      to: '2026-03-29',
      zone: BERLIN,
    });
    expect(minutes.get('2026-03-29')).toBe(120);
  });
});

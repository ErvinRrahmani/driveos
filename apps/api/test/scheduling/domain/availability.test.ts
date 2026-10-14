import { describe, expect, it } from 'vitest';
import {
  expandAvailability,
  openingHoursFor,
  overlappingWindows,
  planAvailabilityReplace,
  type WeeklyRule,
} from '../../../src/modules/scheduling/domain/availability.js';

const INGO = '0192f000-0003-7000-8000-000000000003';
const INA = '0192f000-0003-7000-8000-000000000099';
const BERLIN = 'Europe/Berlin';

const rule = (
  weekday: number,
  startTime: string,
  endTime: string,
  extra: Partial<WeeklyRule> = {},
) =>
  ({
    instructorMembershipId: INGO,
    weekday,
    startTime,
    endTime,
    validFrom: '2026-01-01',
    validTo: null,
    ...extra,
  }) satisfies WeeklyRule;

const range = (from: string, to: string) => ({ start: new Date(from), end: new Date(to) });
const iso = (windows: { instructorMembershipId: string; start: Date; end: Date }[]) =>
  windows.map((w) => ({
    instructorMembershipId: w.instructorMembershipId,
    start: w.start.toISOString(),
    end: w.end.toISOString(),
  }));

describe('expandAvailability', () => {
  it('expands a weekly window into UTC instants for each matching local date', () => {
    const windows = expandAvailability({
      rules: [rule(1, '09:00', '17:00'), rule(3, '12:00', '14:00')],
      range: range('2026-10-12T00:00:00+02:00', '2026-10-19T00:00:00+02:00'),
      zone: BERLIN,
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T07:00:00.000Z',
        end: '2026-10-12T15:00:00.000Z',
      },
      {
        instructorMembershipId: INGO,
        start: '2026-10-14T10:00:00.000Z',
        end: '2026-10-14T12:00:00.000Z',
      },
    ]);
  });

  it('keeps the wall-clock time across the fall-back week (offset +2 before, +1 after)', () => {
    const windows = expandAvailability({
      rules: [rule(6, '09:00', '10:00'), rule(7, '09:00', '10:00'), rule(1, '09:00', '10:00')],
      range: range('2026-10-24T00:00:00Z', '2026-10-27T00:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows).map((w) => w.start)).toEqual([
      '2026-10-24T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
    ]);
  });

  it('keeps the wall-clock time across the spring-forward week (offset +1 before, +2 after)', () => {
    const windows = expandAvailability({
      rules: [rule(6, '09:00', '10:00'), rule(7, '09:00', '10:00')],
      range: range('2026-03-28T00:00:00Z', '2026-03-30T00:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows).map((w) => w.start)).toEqual([
      '2026-03-28T08:00:00.000Z',
      '2026-03-29T07:00:00.000Z',
    ]);
  });

  it('starts a window that begins in the spring-forward gap at the first valid local time', () => {
    const windows = expandAvailability({
      rules: [rule(7, '02:00', '05:00')],
      range: range('2026-03-29T00:00:00Z', '2026-03-30T00:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-03-29T01:00:00.000Z',
        end: '2026-03-29T03:00:00.000Z',
      },
    ]);
  });

  it('uses the first occurrence for a window edge in the repeated fall-back hour', () => {
    const windows = expandAvailability({
      rules: [rule(7, '02:30', '04:00')],
      range: range('2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-10-25T00:30:00.000Z',
        end: '2026-10-25T03:00:00.000Z',
      },
    ]);
  });

  it('respects valid_from and valid_to (both inclusive local dates)', () => {
    const windows = expandAvailability({
      rules: [
        rule(1, '09:00', '12:00', { validTo: '2026-10-12' }),
        rule(1, '13:00', '17:00', { validFrom: '2026-10-19' }),
      ],
      range: range('2026-10-05T00:00:00Z', '2026-10-27T00:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows).map((w) => w.start)).toEqual([
      '2026-10-05T07:00:00.000Z',
      '2026-10-12T07:00:00.000Z',
      '2026-10-19T11:00:00.000Z',
      '2026-10-26T12:00:00.000Z',
    ]);
  });

  it('clips windows to the requested range', () => {
    const windows = expandAvailability({
      rules: [rule(1, '09:00', '17:00')],
      range: range('2026-10-12T10:00:00Z', '2026-10-12T12:00:00Z'),
      zone: BERLIN,
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T10:00:00.000Z',
        end: '2026-10-12T12:00:00.000Z',
      },
    ]);
  });

  it('subtracts time off of the same instructor only', () => {
    const windows = expandAvailability({
      rules: [
        rule(1, '09:00', '17:00'),
        rule(1, '09:00', '17:00', { instructorMembershipId: INA }),
      ],
      range: range('2026-10-12T00:00:00Z', '2026-10-13T00:00:00Z'),
      zone: BERLIN,
      timeOff: [
        {
          instructorMembershipId: INGO,
          start: new Date('2026-10-12T09:00:00Z'),
          end: new Date('2026-10-12T10:30:00Z'),
        },
      ],
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T07:00:00.000Z',
        end: '2026-10-12T09:00:00.000Z',
      },
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T10:30:00.000Z',
        end: '2026-10-12T15:00:00.000Z',
      },
      {
        instructorMembershipId: INA,
        start: '2026-10-12T07:00:00.000Z',
        end: '2026-10-12T15:00:00.000Z',
      },
    ]);
  });

  it('clamps windows to the opening hours of that weekday and drops closed days', () => {
    const windows = expandAvailability({
      rules: [rule(1, '07:00', '21:00'), rule(7, '10:00', '12:00')],
      range: range('2026-10-12T00:00:00Z', '2026-10-19T00:00:00Z'),
      zone: BERLIN,
      openingHours: () => [
        { weekday: 1, opens: '08:00', closes: '12:00' },
        { weekday: 1, opens: '13:00', closes: '20:00' },
      ],
    });
    expect(iso(windows)).toEqual([
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T06:00:00.000Z',
        end: '2026-10-12T10:00:00.000Z',
      },
      {
        instructorMembershipId: INGO,
        start: '2026-10-12T11:00:00.000Z',
        end: '2026-10-12T18:00:00.000Z',
      },
    ]);
  });

  it('does not clamp when the school has no opening hours at all', () => {
    const windows = expandAvailability({
      rules: [rule(7, '10:00', '12:00')],
      range: range('2026-10-18T00:00:00Z', '2026-10-19T00:00:00Z'),
      zone: BERLIN,
      openingHours: () => null,
    });
    expect(windows).toHaveLength(1);
  });
});

describe('openingHoursFor', () => {
  const BRANCH_A = 'branch-a';
  const BRANCH_B = 'branch-b';
  const rows = [
    { branchId: null, weekday: 1, opens: '08:00', closes: '20:00' },
    { branchId: BRANCH_A, weekday: 6, opens: '09:00', closes: '14:00' },
    { branchId: BRANCH_B, weekday: 7, opens: '10:00', closes: '12:00' },
  ];

  it('is unconstrained (null) when the school has no opening hours', () => {
    expect(openingHoursFor([], [BRANCH_A])).toBeNull();
  });

  it('uses school-wide rows plus the rows of the instructor branches', () => {
    expect(openingHoursFor(rows, [BRANCH_A])?.map((r) => r.weekday)).toEqual([1, 6]);
  });

  it('uses every row for an instructor without branches (none = all)', () => {
    expect(openingHoursFor(rows, [])?.map((r) => r.weekday)).toEqual([1, 6, 7]);
  });
});

describe('planAvailabilityReplace', () => {
  const row = (id: string, validFrom: string, validTo: string | null) => ({
    id,
    validFrom,
    validTo,
  });

  it('closes an open-ended row the day before effectiveFrom', () => {
    expect(planAvailabilityReplace([row('a', '2026-01-01', null)], '2026-10-19', null)).toEqual({
      deleteIds: [],
      updates: [{ id: 'a', validFrom: '2026-01-01', validTo: '2026-10-18' }],
      copies: [],
    });
  });

  it('leaves rows that end before effectiveFrom untouched', () => {
    expect(
      planAvailabilityReplace([row('a', '2026-01-01', '2026-10-18')], '2026-10-19', null),
    ).toEqual({ deleteIds: [], updates: [], copies: [] });
  });

  it('deletes rows that start on or after effectiveFrom when the new pattern is open-ended', () => {
    expect(
      planAvailabilityReplace(
        [row('a', '2026-10-19', null), row('b', '2026-11-01', '2026-12-01')],
        '2026-10-19',
        null,
      ),
    ).toEqual({ deleteIds: ['a', 'b'], updates: [], copies: [] });
  });

  it('with effectiveTo, the old pattern resumes the day after (split into a copy)', () => {
    expect(
      planAvailabilityReplace([row('a', '2026-01-01', null)], '2026-10-19', '2026-10-25'),
    ).toEqual({
      deleteIds: [],
      updates: [{ id: 'a', validFrom: '2026-01-01', validTo: '2026-10-18' }],
      copies: [{ sourceId: 'a', validFrom: '2026-10-26', validTo: null }],
    });
  });

  it('with effectiveTo, a row starting inside the range starts the day after it', () => {
    expect(
      planAvailabilityReplace([row('a', '2026-10-20', '2026-12-31')], '2026-10-19', '2026-10-25'),
    ).toEqual({
      deleteIds: [],
      updates: [{ id: 'a', validFrom: '2026-10-26', validTo: '2026-12-31' }],
      copies: [],
    });
  });

  it('with effectiveTo, rows entirely inside the range are deleted and later rows are untouched', () => {
    expect(
      planAvailabilityReplace(
        [row('a', '2026-10-20', '2026-10-22'), row('b', '2026-11-01', null)],
        '2026-10-19',
        '2026-10-25',
      ),
    ).toEqual({ deleteIds: ['a'], updates: [], copies: [] });
  });
});

describe('overlappingWindows', () => {
  it('lists the indexes of windows that overlap an earlier one on the same weekday', () => {
    expect(
      overlappingWindows([
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '12:00', endTime: '17:00' },
        { weekday: 2, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '11:30', endTime: '13:00' },
      ]),
    ).toEqual([3]);
  });
});

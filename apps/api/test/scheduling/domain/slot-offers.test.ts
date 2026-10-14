import { describe, expect, it } from 'vitest';
import {
  type AudienceCandidate,
  matchesPreferredWindows,
  offerExpiresAt,
  selectAudience,
  type SlotForAudience,
  type WaitingListCandidate,
} from '../../../src/modules/scheduling/domain/slot-offers.js';

const ZONE = 'Europe/Berlin';
const INSTRUCTOR = 'instructor-1';
const OTHER_INSTRUCTOR = 'instructor-2';
const TYPE = 'type-standard';

const slot: SlotForAudience = {
  lessonTypeId: TYPE,
  licenceClass: 'B',
  creditMinutes: 60,
  instructorMembershipId: INSTRUCTOR,
  period: {
    start: new Date('2030-01-08T09:00:00.000Z'),
    end: new Date('2030-01-08T10:00:00.000Z'),
  },
  area: 'Mitte',
};

function student(id: string, overrides: Partial<AudienceCandidate> = {}): AudienceCandidate {
  return {
    studentId: id,
    status: 'active',
    licenceClass: 'B',
    area: 'Mitte',
    allowedInstructorMembershipIds: [],
    balance: 120,
    ...overrides,
  };
}

function waiting(
  studentId: string,
  createdAt: string,
  overrides: Partial<WaitingListCandidate> = {},
): WaitingListCandidate {
  return {
    id: `entry-${studentId}`,
    studentId,
    lessonTypeId: TYPE,
    preferredWindows: [{ weekday: 2, start: '09:00', end: '12:00' }],
    createdAt: new Date(createdAt),
    ...overrides,
  };
}

describe('offerExpiresAt', () => {
  const start = new Date('2030-01-08T09:00:00.000Z');

  it('uses the school TTL when the lesson is far away', () => {
    const now = new Date('2030-01-07T09:00:00.000Z');
    expect(offerExpiresAt(now, start, 60)).toEqual(new Date('2030-01-07T10:00:00.000Z'));
  });

  it('closes the offer two hours before the start when that comes first', () => {
    const now = new Date('2030-01-08T06:30:00.000Z');
    expect(offerExpiresAt(now, start, 60)).toEqual(new Date('2030-01-08T07:00:00.000Z'));
  });

  it('returns a moment at or before now when the start is less than two hours away', () => {
    const now = new Date('2030-01-08T07:30:00.000Z');
    expect(offerExpiresAt(now, start, 60).getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe('matchesPreferredWindows', () => {
  it('matches a slot inside a window on the same local weekday', () => {
    expect(
      matchesPreferredWindows(slot.period, [{ weekday: 2, start: '10:00', end: '11:00' }], ZONE),
    ).toBe(true);
  });

  it('rejects a slot on another weekday or outside the window', () => {
    expect(
      matchesPreferredWindows(slot.period, [{ weekday: 3, start: '09:00', end: '12:00' }], ZONE),
    ).toBe(false);
    expect(
      matchesPreferredWindows(slot.period, [{ weekday: 2, start: '10:30', end: '12:00' }], ZONE),
    ).toBe(false);
    expect(
      matchesPreferredWindows(slot.period, [{ weekday: 2, start: '08:00', end: '10:30' }], ZONE),
    ).toBe(false);
  });

  it('accepts windows given with seconds', () => {
    expect(
      matchesPreferredWindows(
        slot.period,
        [{ weekday: 2, start: '10:00:00', end: '11:00:00' }],
        ZONE,
      ),
    ).toBe(true);
  });
});

describe('selectAudience', () => {
  it('offers waiting-list matches before area matches, first come first served', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [
        waiting('late', '2030-01-02T00:00:00.000Z'),
        waiting('early', '2030-01-01T00:00:00.000Z'),
      ],
      candidates: [student('late'), student('early'), student('area-only')],
    });
    expect(result).toEqual({ tier: 'waiting_list', studentIds: ['early', 'late'] });
  });

  it('ignores waiting-list entries for other lesson types or windows', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [
        waiting('other-type', '2030-01-01T00:00:00.000Z', { lessonTypeId: 'type-long' }),
        waiting('other-window', '2030-01-01T00:00:00.000Z', {
          preferredWindows: [{ weekday: 4, start: '09:00', end: '12:00' }],
        }),
      ],
      candidates: [
        student('other-type', { area: 'Pankow' }),
        student('other-window', { area: 'Pankow' }),
        student('area-a'),
        student('area-b', { area: ' mitte ' }),
        student('elsewhere', { area: 'Pankow' }),
      ],
    });
    expect(result).toEqual({ tier: 'area', studentIds: ['area-a', 'area-b'] });
  });

  it('falls back to area matches when no waiting-list student is eligible', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [waiting('poor', '2030-01-01T00:00:00.000Z')],
      candidates: [student('poor', { balance: 30 }), student('area-a')],
    });
    expect(result).toEqual({ tier: 'area', studentIds: ['area-a'] });
  });

  it('excludes students without enough credit, another licence class or a disallowed instructor', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [],
      candidates: [
        student('poor', { balance: 59 }),
        student('exact', { balance: 60 }),
        student('class-a', { licenceClass: 'A' }),
        student('archived', { status: 'archived' }),
        student('assigned-elsewhere', { allowedInstructorMembershipIds: [OTHER_INSTRUCTOR] }),
        student('assigned-here', {
          allowedInstructorMembershipIds: [OTHER_INSTRUCTOR, INSTRUCTOR],
        }),
      ],
    });
    expect(result).toEqual({ tier: 'area', studentIds: ['exact', 'assigned-here'] });
  });

  it('has no area matches when the slot has no area', () => {
    const result = selectAudience({
      slot: { ...slot, area: null },
      zone: ZONE,
      waitingList: [],
      candidates: [student('area-a')],
    });
    expect(result).toEqual({ tier: 'none', studentIds: [] });
  });

  it('restricts the audience to explicit students after the same eligibility filters', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [waiting('waiting', '2030-01-01T00:00:00.000Z')],
      candidates: [
        student('waiting'),
        student('chosen', { area: 'Pankow' }),
        student('chosen-poor', { balance: 0 }),
        student('chosen-class', { licenceClass: 'A' }),
      ],
      studentIds: ['chosen', 'chosen-poor', 'chosen-class', 'chosen', 'unknown'],
    });
    expect(result).toEqual({ tier: 'explicit', studentIds: ['chosen'] });
  });

  it('never offers excluded students', () => {
    const result = selectAudience({
      slot,
      zone: ZONE,
      waitingList: [waiting('canceller', '2030-01-01T00:00:00.000Z')],
      candidates: [student('canceller'), student('area-a')],
      excludeStudentIds: ['canceller'],
    });
    expect(result).toEqual({ tier: 'area', studentIds: ['area-a'] });
  });
});

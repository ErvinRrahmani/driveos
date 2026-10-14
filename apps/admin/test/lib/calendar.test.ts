import { describe, expect, it } from 'vitest';
import {
  calendarDays,
  conflictPeriod,
  gridBounds,
  isLateCancel,
  layoutLanes,
  nearestLessonType,
  snapToSlot,
  visibleRange,
} from '../../src/lib/calendar';

const BERLIN = 'Europe/Berlin';

describe('calendarDays', () => {
  it('lists Monday to Sunday for the week view and one day for the day view', () => {
    expect(calendarDays('week', '2026-10-08')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(calendarDays('day', '2026-10-08')).toEqual(['2026-10-08']);
  });
});

describe('visibleRange', () => {
  it('spans local midnight to local midnight in the school time zone', () => {
    expect(visibleRange(['2026-10-12', '2026-10-13'], BERLIN)).toEqual({
      from: '2026-10-11T22:00:00.000Z',
      to: '2026-10-13T22:00:00.000Z',
    });
  });
});

describe('gridBounds', () => {
  it('defaults to 06:00-22:00', () => {
    expect(gridBounds([], [])).toEqual({ start: 360, end: 1320 });
  });

  it('follows opening hours, rounded out to whole hours', () => {
    expect(
      gridBounds(
        [
          { opens: '08:30', closes: '20:00' },
          { opens: '09:00', closes: '14:15' },
        ],
        [],
      ),
    ).toEqual({ start: 480, end: 1200 });
  });

  it('widens to show lessons outside the opening hours', () => {
    expect(gridBounds([{ opens: '08:00', closes: '18:00' }], [{ start: 420, end: 1290 }])).toEqual({
      start: 420,
      end: 1320,
    });
  });
});

describe('snapToSlot', () => {
  it('rounds to the nearest 15 minutes', () => {
    expect(snapToSlot(7)).toBe(0);
    expect(snapToSlot(8)).toBe(15);
    expect(snapToSlot(-22)).toBe(-15);
    expect(snapToSlot(52)).toBe(45);
  });
});

describe('isLateCancel', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it('is late inside the cancellation window', () => {
    expect(isLateCancel('2026-10-12T07:00:00Z', now, 24)).toBe(true);
  });
  it('is not late before the window', () => {
    expect(isLateCancel('2026-10-12T13:00:00Z', now, 24)).toBe(false);
  });
});

describe('conflictPeriod', () => {
  const lessons = [{ id: 'a', start: '2026-10-12T09:00:00.000Z', end: '2026-10-12T10:00:00.000Z' }];

  it('reads the period from the error details', () => {
    const error = {
      error: {
        code: 'lesson_conflict',
        message: 'Clash',
        details: { start: '2026-10-12T11:00:00.000Z', end: '2026-10-12T12:00:00.000Z' },
      },
    };
    expect(conflictPeriod(error, lessons)).toEqual({
      start: '2026-10-12T11:00:00.000Z',
      end: '2026-10-12T12:00:00.000Z',
    });
  });

  it('reads a nested period', () => {
    const error = {
      error: {
        code: 'lesson_conflict',
        message: 'Clash',
        details: {
          conflictingPeriod: { start: '2026-10-12T11:00:00.000Z', end: '2026-10-12T12:00:00.000Z' },
        },
      },
    };
    expect(conflictPeriod(error, lessons)?.start).toBe('2026-10-12T11:00:00.000Z');
  });

  it('falls back to the conflicting lesson id', () => {
    const error = {
      error: { code: 'lesson_conflict', message: 'Clash', details: { lessonId: 'a' } },
    };
    expect(conflictPeriod(error, lessons)).toEqual({
      start: '2026-10-12T09:00:00.000Z',
      end: '2026-10-12T10:00:00.000Z',
    });
  });

  it('returns null for other errors', () => {
    expect(conflictPeriod({ error: { code: 'not_found', message: 'x' } }, lessons)).toBeNull();
  });
});

describe('nearestLessonType', () => {
  const types = [
    { id: 'std', kind: 'lesson', licenceClass: 'B', minutes: 60, active: true },
    { id: 'night', kind: 'lesson', licenceClass: 'B', minutes: 45, active: true },
    { id: 'long', kind: 'lesson', licenceClass: 'B', minutes: 90, active: false },
    { id: 'exam', kind: 'exam', licenceClass: 'B', minutes: 30, active: true },
  ] as const;

  it('picks the active type of the same kind and class closest to the new length', () => {
    expect(nearestLessonType(types, 'std', 40)?.id).toBe('night');
    expect(nearestLessonType(types, 'night', 90)?.id).toBe('std');
  });
});

describe('layoutLanes', () => {
  it('puts overlapping lessons side by side', () => {
    const lanes = layoutLanes([
      { id: 'a', start: 540, end: 600 },
      { id: 'b', start: 570, end: 630 },
      { id: 'c', start: 660, end: 720 },
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 1 });
  });
});

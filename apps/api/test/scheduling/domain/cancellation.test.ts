import { describe, expect, it } from 'vitest';
import {
  cancellationDecision,
  isInsideWindow,
} from '../../../src/modules/scheduling/domain/cancellation.js';
import { moveInsideWindow } from '../../../src/modules/scheduling/domain/move.js';

const lessonStart = new Date('2026-10-13T10:00:00.000Z');
const exactlyAtWindow = new Date('2026-10-12T10:00:00.000Z');
const oneSecondInside = new Date('2026-10-12T10:00:01.000Z');

describe('isInsideWindow', () => {
  it('exactly at the window boundary is not inside', () => {
    expect(isInsideWindow({ now: exactlyAtWindow, lessonStart, windowHours: 24 })).toBe(false);
  });

  it('one second inside the window is inside', () => {
    expect(isInsideWindow({ now: oneSecondInside, lessonStart, windowHours: 24 })).toBe(true);
  });

  it('a window of 0 hours is never inside before the start', () => {
    expect(
      isInsideWindow({ now: new Date('2026-10-13T09:59:59Z'), lessonStart, windowHours: 0 }),
    ).toBe(false);
  });
});

describe('cancellationDecision', () => {
  it('a student cancelling exactly at the window boundary is not late and gets the minutes back', () => {
    expect(
      cancellationDecision({
        now: exactlyAtWindow,
        lessonStart,
        windowHours: 24,
        byRole: 'student',
        override: false,
      }),
    ).toEqual({ late: false, restore: true, requiresAudit: false });
  });

  it('a student cancelling 1 s inside the window is late and keeps nothing', () => {
    expect(
      cancellationDecision({
        now: oneSecondInside,
        lessonStart,
        windowHours: 24,
        byRole: 'student',
        override: false,
      }),
    ).toEqual({ late: true, restore: false, requiresAudit: false });
  });

  it('a parent cancelling late follows the student rule', () => {
    expect(
      cancellationDecision({
        now: oneSecondInside,
        lessonStart,
        windowHours: 24,
        byRole: 'parent',
        override: false,
      }),
    ).toEqual({ late: true, restore: false, requiresAudit: false });
  });

  it.each(['owner', 'office', 'instructor'] as const)(
    'a cancel by %s always restores and is not late, even inside the window',
    (byRole) => {
      expect(
        cancellationDecision({
          now: oneSecondInside,
          lessonStart,
          windowHours: 24,
          byRole,
          override: false,
        }),
      ).toEqual({ late: false, restore: true, requiresAudit: false });
    },
  );

  it.each(['owner', 'office'] as const)(
    '%s keeping the credit inside the window records a late cancel that must be audited',
    (byRole) => {
      expect(
        cancellationDecision({
          now: oneSecondInside,
          lessonStart,
          windowHours: 24,
          byRole,
          override: true,
        }),
      ).toEqual({ late: true, restore: false, requiresAudit: true });
    },
  );

  it('keeping the credit exactly at the window boundary is refused', () => {
    expect(
      cancellationDecision({
        now: exactlyAtWindow,
        lessonStart,
        windowHours: 24,
        byRole: 'office',
        override: true,
      }),
    ).toEqual({ refused: 'override_outside_window' });
  });

  it.each(['instructor', 'student', 'parent'] as const)(
    '%s may not keep or restore the credit by override',
    (byRole) => {
      expect(
        cancellationDecision({
          now: oneSecondInside,
          lessonStart,
          windowHours: 24,
          byRole,
          override: true,
        }),
      ).toEqual({ refused: 'override_not_allowed' });
    },
  );
});

describe('moveInsideWindow', () => {
  it('a student moving a lesson whose original start is inside the window is a late cancellation', () => {
    expect(
      moveInsideWindow({
        now: oneSecondInside,
        originalStart: lessonStart,
        windowHours: 24,
        byRole: 'student',
      }),
    ).toEqual({ lateCancellation: true });
  });

  it('a parent moving exactly at the window boundary moves freely', () => {
    expect(
      moveInsideWindow({
        now: exactlyAtWindow,
        originalStart: lessonStart,
        windowHours: 24,
        byRole: 'parent',
      }),
    ).toEqual({ lateCancellation: false });
  });

  it.each(['owner', 'office', 'instructor'] as const)(
    '%s moves freely inside the window',
    (byRole) => {
      expect(
        moveInsideWindow({
          now: oneSecondInside,
          originalStart: lessonStart,
          windowHours: 24,
          byRole,
        }),
      ).toEqual({ lateCancellation: false });
    },
  );
});

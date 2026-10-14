import { describe, expect, it } from 'vitest';
import { canCancel, isLateCancel } from '../../src/lib/cancellation';

const START = '2026-10-10T10:00:00.000Z';
const hoursBefore = (hours: number) => Date.parse(START) - hours * 3_600_000;

describe('isLateCancel', () => {
  it('is late inside the cancellation window', () => {
    expect(isLateCancel(START, hoursBefore(23.5), 24)).toBe(true);
  });

  it('is not late before the window', () => {
    expect(isLateCancel(START, hoursBefore(24.5), 24)).toBe(false);
  });

  it('treats exactly the window length as on time', () => {
    expect(isLateCancel(START, hoursBefore(24), 24)).toBe(false);
  });

  it('uses the school setting, not a fixed 24 hours', () => {
    expect(isLateCancel(START, hoursBefore(30), 48)).toBe(true);
    expect(isLateCancel(START, hoursBefore(3), 2)).toBe(false);
  });

  it('is never late with a zero-hour window', () => {
    expect(isLateCancel(START, hoursBefore(0.1), 0)).toBe(false);
  });
});

describe('canCancel', () => {
  it('allows cancelling a booked lesson that has not started', () => {
    expect(canCancel({ status: 'booked', start: START }, hoursBefore(1))).toBe(true);
  });

  it('refuses lessons that started or are no longer booked', () => {
    expect(canCancel({ status: 'booked', start: START }, hoursBefore(-0.1))).toBe(false);
    expect(canCancel({ status: 'cancelled', start: START }, hoursBefore(5))).toBe(false);
    expect(canCancel({ status: 'completed', start: START }, hoursBefore(5))).toBe(false);
  });
});

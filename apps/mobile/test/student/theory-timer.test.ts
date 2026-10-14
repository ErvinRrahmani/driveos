import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, remainingMs, startCountdown } from '../../src/lib/theory-timer';

const DEADLINE = '2026-10-08T10:15:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('remainingMs', () => {
  it('is the time left until the server deadline', () => {
    expect(remainingMs(DEADLINE, at('2026-10-08T10:00:00.000Z'))).toBe(15 * 60_000);
  });

  it('never goes below zero', () => {
    expect(remainingMs(DEADLINE, at('2026-10-08T10:20:00.000Z'))).toBe(0);
  });

  it('is null when the session has no deadline', () => {
    expect(remainingMs(null, at('2026-10-08T10:00:00.000Z'))).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('shows minutes and seconds, rounding partial seconds up', () => {
    expect(formatCountdown(15 * 60_000)).toBe('15:00');
    expect(formatCountdown(61_001)).toBe('01:02');
    expect(formatCountdown(999)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('shows hours for long exams', () => {
    expect(formatCountdown(65 * 60_000)).toBe('1:05:00');
  });
});

describe('startCountdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('recomputes from the deadline on every tick instead of counting down locally', () => {
    let clock = at('2026-10-08T10:14:57.000Z');
    const ticks: number[] = [];
    const stop = startCountdown({
      deadlineAt: DEADLINE,
      now: () => clock,
      onTick: (ms) => ticks.push(ms),
      onExpire: () => undefined,
    });
    expect(ticks).toEqual([3_000]);
    clock += 1_700;
    vi.advanceTimersByTime(1_000);
    expect(ticks.at(-1)).toBe(1_300);
    stop();
  });

  it('expires exactly once when the remaining time reaches zero', () => {
    let clock = at('2026-10-08T10:14:58.000Z');
    const onExpire = vi.fn();
    startCountdown({ deadlineAt: DEADLINE, now: () => clock, onTick: () => undefined, onExpire });
    clock += 1_000;
    vi.advanceTimersByTime(1_000);
    expect(onExpire).not.toHaveBeenCalled();
    clock += 1_000;
    vi.advanceTimersByTime(1_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    clock += 5_000;
    vi.advanceTimersByTime(5_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('expires at once when the deadline already passed', () => {
    const onExpire = vi.fn();
    startCountdown({
      deadlineAt: DEADLINE,
      now: () => at('2026-10-08T11:00:00.000Z'),
      onTick: () => undefined,
      onExpire,
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('stops ticking when stopped', () => {
    let clock = at('2026-10-08T10:00:00.000Z');
    const onTick = vi.fn();
    const stop = startCountdown({
      deadlineAt: DEADLINE,
      now: () => clock,
      onTick,
      onExpire: () => undefined,
    });
    stop();
    clock += 3_000;
    vi.advanceTimersByTime(3_000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});

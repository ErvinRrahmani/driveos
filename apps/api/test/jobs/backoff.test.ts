import { describe, expect, it } from 'vitest';
import { boundedExponentialDelay } from '../../src/kernel/jobs/backoff.js';

describe('boundedExponentialDelay', () => {
  it('doubles the delay after each failed attempt', () => {
    const delays = [1, 2, 3, 4, 5].map((attempts) =>
      boundedExponentialDelay(attempts, { delayMs: 1000, maxMs: 60_000 }),
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('never exceeds the maximum', () => {
    expect(boundedExponentialDelay(9, { delayMs: 1000, maxMs: 300_000 })).toBe(256_000);
    expect(boundedExponentialDelay(10, { delayMs: 1000, maxMs: 300_000 })).toBe(300_000);
    expect(boundedExponentialDelay(60, { delayMs: 1000, maxMs: 300_000 })).toBe(300_000);
  });
});

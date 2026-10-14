export interface BackoffBounds {
  delayMs: number;
  maxMs: number;
}

export const BOUNDED_EXPONENTIAL = 'bounded-exponential';

export function boundedExponentialDelay(attemptsMade: number, bounds: BackoffBounds): number {
  const exponent = Math.max(0, attemptsMade - 1);
  return Math.min(bounds.maxMs, bounds.delayMs * 2 ** exponent);
}

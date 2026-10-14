import type { Period } from './period.js';

const MINUTE = 60_000;

export function satisfiesMinGap(
  candidate: Period,
  busy: readonly Period[],
  minGapMinutes: number,
): boolean {
  const gap = minGapMinutes * MINUTE;
  return busy.every(
    (other) =>
      candidate.end.getTime() + gap <= other.start.getTime() ||
      other.end.getTime() + gap <= candidate.start.getTime(),
  );
}

import type { InstructorPeriod } from './availability.js';
import { FREE_SLOT_STEP_MINUTES } from './free-slots.js';
import { type Period, subtractPeriods } from './period.js';

const MINUTE = 60_000;

export interface GapInput {
  windows: readonly InstructorPeriod[];
  instructorBusy: ReadonlyMap<string, readonly Period[]>;
  minMinutes: number;
  minGapMinutes: number;
  notBefore?: Date;
  stepMinutes?: number;
}

function mergeTouching(windows: readonly InstructorPeriod[]): InstructorPeriod[] {
  const sorted = [...windows].sort(
    (a, b) =>
      a.instructorMembershipId.localeCompare(b.instructorMembershipId) ||
      a.start.getTime() - b.start.getTime(),
  );
  const merged: InstructorPeriod[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (
      last &&
      last.instructorMembershipId === window.instructorMembershipId &&
      window.start <= last.end
    ) {
      if (window.end > last.end) last.end = window.end;
      continue;
    }
    merged.push({ ...window });
  }
  return merged;
}

export function findGaps(input: GapInput): InstructorPeriod[] {
  const step = (input.stepMinutes ?? FREE_SLOT_STEP_MINUTES) * MINUTE;
  const pad = input.minGapMinutes * MINUTE;
  const length = input.minMinutes * MINUTE;
  const notBefore = input.notBefore?.getTime() ?? Number.NEGATIVE_INFINITY;
  const gaps: InstructorPeriod[] = [];
  for (const window of mergeTouching(input.windows)) {
    const busy = (input.instructorBusy.get(window.instructorMembershipId) ?? []).map((lesson) => ({
      start: new Date(lesson.start.getTime() - pad),
      end: new Date(lesson.end.getTime() + pad),
    }));
    for (const free of subtractPeriods(window, busy)) {
      const start = Math.ceil(Math.max(free.start.getTime(), notBefore) / step) * step;
      if (free.end.getTime() - start < length) continue;
      gaps.push({
        instructorMembershipId: window.instructorMembershipId,
        start: new Date(start),
        end: free.end,
      });
    }
  }
  return gaps.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.instructorMembershipId.localeCompare(b.instructorMembershipId),
  );
}

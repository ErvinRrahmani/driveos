import { type Period, subtractPeriods } from './period.js';
import { addDays, isoWeekday, localDateOf, localToUtcOrTransition } from './time-zone.js';

export interface WeeklyRule {
  instructorMembershipId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string | null;
}

export interface OpeningRange {
  weekday: number;
  opens: string;
  closes: string;
}

export interface BranchOpeningRange extends OpeningRange {
  branchId: string | null;
}

export interface InstructorPeriod extends Period {
  instructorMembershipId: string;
}

export interface ExpandInput {
  rules: readonly WeeklyRule[];
  range: Period;
  zone: string;
  timeOff?: readonly InstructorPeriod[];
  openingHours?: (instructorMembershipId: string) => readonly OpeningRange[] | null;
}

interface LocalSpan {
  start: string;
  end: string;
}

function clampToOpening(
  span: LocalSpan,
  weekday: number,
  opening: readonly OpeningRange[] | null,
): LocalSpan[] {
  if (opening === null) return [span];
  return opening
    .filter((range) => range.weekday === weekday)
    .map((range) => ({
      start: span.start > range.opens ? span.start : range.opens,
      end: span.end < range.closes ? span.end : range.closes,
    }))
    .filter((clamped) => clamped.start < clamped.end);
}

function isValidOn(rule: WeeklyRule, date: string): boolean {
  return rule.validFrom <= date && (rule.validTo === null || date <= rule.validTo);
}

export function expandAvailability(input: ExpandInput): InstructorPeriod[] {
  const { rules, range, zone } = input;
  const firstDate = addDays(localDateOf(range.start, zone), -1);
  const lastDate = addDays(localDateOf(range.end, zone), 1);
  const openingCache = new Map<string, readonly OpeningRange[] | null>();
  const openingOf = (instructor: string) => {
    if (!openingCache.has(instructor)) {
      openingCache.set(instructor, input.openingHours?.(instructor) ?? null);
    }
    return openingCache.get(instructor) ?? null;
  };

  const windows: InstructorPeriod[] = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    const weekday = isoWeekday(date);
    for (const rule of rules) {
      if (rule.weekday !== weekday || !isValidOn(rule, date)) continue;
      const spans = clampToOpening(
        { start: rule.startTime, end: rule.endTime },
        weekday,
        openingOf(rule.instructorMembershipId),
      );
      for (const span of spans) {
        const start = localToUtcOrTransition(date, span.start, zone);
        const end = localToUtcOrTransition(date, span.end, zone);
        const clipped = {
          start: start > range.start ? start : range.start,
          end: end < range.end ? end : range.end,
        };
        if (clipped.start >= clipped.end) continue;
        const cuts = (input.timeOff ?? []).filter(
          (off) => off.instructorMembershipId === rule.instructorMembershipId,
        );
        for (const piece of subtractPeriods(clipped, cuts)) {
          windows.push({ instructorMembershipId: rule.instructorMembershipId, ...piece });
        }
      }
    }
  }
  return windows.sort(
    (a, b) =>
      a.instructorMembershipId.localeCompare(b.instructorMembershipId) ||
      a.start.getTime() - b.start.getTime(),
  );
}

export function openingHoursFor(
  rows: readonly BranchOpeningRange[],
  branchIds: readonly string[],
): OpeningRange[] | null {
  if (rows.length === 0) return null;
  return rows.filter(
    (row) => row.branchId === null || branchIds.length === 0 || branchIds.includes(row.branchId),
  );
}

export interface DatedRow {
  id: string;
  validFrom: string;
  validTo: string | null;
}

export interface AvailabilityReplacePlan {
  deleteIds: string[];
  updates: DatedRow[];
  copies: { sourceId: string; validFrom: string; validTo: string | null }[];
}

export function planAvailabilityReplace(
  existing: readonly DatedRow[],
  effectiveFrom: string,
  effectiveTo: string | null,
): AvailabilityReplacePlan {
  const plan: AvailabilityReplacePlan = { deleteIds: [], updates: [], copies: [] };
  const dayBefore = addDays(effectiveFrom, -1);
  const dayAfter = effectiveTo === null ? null : addDays(effectiveTo, 1);
  for (const row of existing) {
    const endsBefore = row.validTo !== null && row.validTo < effectiveFrom;
    const startsAfter = effectiveTo !== null && row.validFrom > effectiveTo;
    if (endsBefore || startsAfter) continue;
    const outlasts = dayAfter !== null && (row.validTo === null || row.validTo >= dayAfter);
    if (row.validFrom < effectiveFrom) {
      plan.updates.push({ id: row.id, validFrom: row.validFrom, validTo: dayBefore });
      if (outlasts)
        plan.copies.push({ sourceId: row.id, validFrom: dayAfter, validTo: row.validTo });
    } else if (outlasts) {
      plan.updates.push({ id: row.id, validFrom: dayAfter, validTo: row.validTo });
    } else {
      plan.deleteIds.push(row.id);
    }
  }
  return plan;
}

export interface LocalWindow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export function overlappingWindows(windows: readonly LocalWindow[]): number[] {
  return windows.flatMap((window, index) =>
    windows
      .slice(0, index)
      .some(
        (earlier) =>
          earlier.weekday === window.weekday &&
          earlier.startTime < window.endTime &&
          window.startTime < earlier.endTime,
      )
      ? [index]
      : [],
  );
}

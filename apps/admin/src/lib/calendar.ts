import { z } from 'zod';
import { apiErrorCode } from './api-errors';
import {
  addDays,
  formatMinutes,
  parseMinutes,
  startOfIsoWeek,
  zonedParts,
  zonedToUtc,
} from './zoned-time';

export const CALENDAR_VIEWS = ['week', 'day'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_GROUPS = ['instructor', 'vehicle'] as const;
export type CalendarGroup = (typeof CALENDAR_GROUPS)[number];

export const SLOT_MINUTES = 15;
export const DEFAULT_GRID = { start: 6 * 60, end: 22 * 60 };

export interface Period {
  start: string;
  end: string;
}

export function calendarDays(view: CalendarView, date: string): string[] {
  if (view === 'day') return [date];
  const monday = startOfIsoWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function visibleRange(
  days: readonly string[],
  timeZone: string,
): { from: string; to: string } {
  const first = days[0] ?? '';
  const last = days[days.length - 1] ?? first;
  return { from: zonedToUtc(first, 0, timeZone), to: zonedToUtc(addDays(last, 1), 0, timeZone) };
}

export function gridBounds(
  hours: readonly { opens: string; closes: string }[],
  spans: readonly { start: number; end: number }[],
): { start: number; end: number } {
  const base = hours.length
    ? {
        start: Math.min(...hours.map((entry) => parseMinutes(entry.opens))),
        end: Math.max(...hours.map((entry) => parseMinutes(entry.closes))),
      }
    : DEFAULT_GRID;
  const start = Math.min(base.start, ...spans.map((span) => span.start));
  const end = Math.max(base.end, ...spans.map((span) => span.end));
  return {
    start: Math.max(0, Math.floor(start / 60) * 60),
    end: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}

export function snapToSlot(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES || 0;
}

export function isLateCancel(start: string, now: Date, windowHours: number): boolean {
  return Date.parse(start) - now.getTime() < windowHours * 3_600_000;
}

const periodSchema = z.object({ start: z.string(), end: z.string() });
const detailsSchema = z.union([
  periodSchema,
  z.object({ conflictingPeriod: periodSchema }).transform((details) => details.conflictingPeriod),
  z.object({ period: periodSchema }).transform((details) => details.period),
  z.object({ lessonId: z.string() }),
]);

export function conflictPeriod(
  error: unknown,
  lessons: readonly ({ id: string } & Period)[],
): Period | null {
  if (apiErrorCode(error) !== 'lesson_conflict') return null;
  const details = detailsSchema.safeParse(
    (error as { error: { details?: unknown } }).error.details,
  );
  if (!details.success) return null;
  if ('lessonId' in details.data) {
    const { lessonId } = details.data;
    const lesson = lessons.find((candidate) => candidate.id === lessonId);
    return lesson ? { start: lesson.start, end: lesson.end } : null;
  }
  return { start: details.data.start, end: details.data.end };
}

interface TypeShape {
  id: string;
  kind: string;
  licenceClass: string;
  minutes: number;
  active: boolean;
}

export function nearestLessonType<T extends TypeShape>(
  types: readonly T[],
  currentId: string,
  minutes: number,
): T | undefined {
  const current = types.find((type) => type.id === currentId);
  if (!current) return undefined;
  return types
    .filter(
      (type) =>
        type.id === current.id ||
        (type.active && type.kind === current.kind && type.licenceClass === current.licenceClass),
    )
    .reduce<T | undefined>(
      (best, type) =>
        !best || Math.abs(type.minutes - minutes) < Math.abs(best.minutes - minutes) ? type : best,
      undefined,
    );
}

export function layoutLanes(
  spans: readonly { id: string; start: number; end: number }[],
): Map<string, { lane: number; lanes: number }> {
  const result = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const span of sorted) {
    if (span.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= span.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.end;
    cluster.push({ id: span.id, lane });
    clusterEnd = Math.max(clusterEnd, span.end);
  }
  flush();
  return result;
}

export function zonedRange(start: string, end: string, timeZone: string) {
  const from = zonedParts(start, timeZone);
  const to = zonedParts(end, timeZone);
  const endMinutes = to.date === from.date ? to.minutes : to.minutes + 24 * 60;
  return {
    day: from.date,
    start: from.minutes,
    end: endMinutes,
    label: `${formatMinutes(from.minutes)}–${formatMinutes(to.minutes)}`,
  };
}

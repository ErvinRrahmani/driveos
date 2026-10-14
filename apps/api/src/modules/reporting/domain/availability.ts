import { daysBetween, isoWeekday, localToUtc } from './buckets.js';

export interface WeeklyWindow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface AvailabilityLayer {
  instructorMembershipId: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  windows: readonly WeeklyWindow[];
}

export interface TimeOffPeriod {
  instructorMembershipId: string;
  start: Date;
  end: Date;
}

export interface AvailableMinutesInput {
  layers: readonly AvailabilityLayer[];
  timeOff: readonly TimeOffPeriod[];
  from: string;
  to: string;
  zone: string;
}

const MINUTE_MS = 60_000;

function overlapMs(start: number, end: number, offStart: number, offEnd: number): number {
  return Math.max(0, Math.min(end, offEnd) - Math.max(start, offStart));
}

function mergedTimeOff(periods: readonly TimeOffPeriod[]): [number, number][] {
  const sorted = periods
    .map((period) => [period.start.getTime(), period.end.getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function layerOn(layers: readonly AvailabilityLayer[], day: string): AvailabilityLayer | null {
  let winner: AvailabilityLayer | null = null;
  for (const layer of layers) {
    const covers =
      layer.effectiveFrom <= day && (layer.effectiveTo === null || day <= layer.effectiveTo);
    if (covers && (winner === null || layer.version > winner.version)) winner = layer;
  }
  return winner;
}

export function availableMinutesByDay(input: AvailableMinutesInput): Map<string, number> {
  const days = daysBetween(input.from, input.to);
  const result = new Map(days.map((day) => [day, 0]));
  const instructors = new Set(input.layers.map((layer) => layer.instructorMembershipId));
  for (const instructor of instructors) {
    const layers = input.layers.filter((layer) => layer.instructorMembershipId === instructor);
    const off = mergedTimeOff(
      input.timeOff.filter((period) => period.instructorMembershipId === instructor),
    );
    for (const day of days) {
      const layer = layerOn(layers, day);
      if (!layer) continue;
      const weekday = isoWeekday(day);
      let ms = 0;
      for (const window of layer.windows) {
        if (window.weekday !== weekday) continue;
        const start = localToUtc(day, window.startTime, input.zone).getTime();
        const end = localToUtc(day, window.endTime, input.zone).getTime();
        if (end <= start) continue;
        const blocked = off.reduce(
          (sum, [offStart, offEnd]) => sum + overlapMs(start, end, offStart, offEnd),
          0,
        );
        ms += end - start - blocked;
      }
      result.set(day, (result.get(day) ?? 0) + Math.round(ms / MINUTE_MS));
    }
  }
  return result;
}

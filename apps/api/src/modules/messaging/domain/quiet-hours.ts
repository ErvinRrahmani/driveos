import type { NotificationChannel, NotificationTiming } from '@driveos/shared';

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface QuietHours {
  start: string;
  end: string;
}

export interface QuietWindow {
  start: Date;
  end: Date;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

function wallClockMs(instant: number, zone: string): number {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(zone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
}

function offsetMs(instant: number, zone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return wallClockMs(whole, zone) - whole;
}

function minuteOfDay(time: string): number {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function localMidnight(instant: Date, zone: string): number {
  const wall = wallClockMs(instant.getTime(), zone);
  return wall - (wall % DAY);
}

function wallToInstant(wall: number, zone: string): Date {
  const offsets = new Set([offsetMs(wall - DAY / 2, zone), offsetMs(wall + DAY / 2, zone)]);
  const exact = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => wallClockMs(instant, zone) === wall)
    .sort((a, b) => a - b);
  if (exact[0] !== undefined) return new Date(exact[0]);
  let before = wall - offsetMs(wall + DAY / 2, zone);
  let after = wall - offsetMs(wall - DAY / 2, zone);
  while (after - before > MINUTE) {
    const middle = before + Math.floor((after - before) / 2 / MINUTE) * MINUTE;
    if (wallClockMs(middle, zone) < wall) before = middle;
    else after = middle;
  }
  return new Date(after);
}

function localOffsetIntoDay(instant: Date, zone: string): number {
  return wallClockMs(instant.getTime(), zone) % DAY;
}

export function isQuiet(instant: Date, quiet: QuietHours, zone: string): boolean {
  const start = minuteOfDay(quiet.start) * MINUTE;
  const end = minuteOfDay(quiet.end) * MINUTE;
  if (start === end) return false;
  const now = localOffsetIntoDay(instant, zone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function quietWindowAt(instant: Date, quiet: QuietHours, zone: string): QuietWindow | null {
  if (!isQuiet(instant, quiet, zone)) return null;
  const start = minuteOfDay(quiet.start) * MINUTE;
  const end = minuteOfDay(quiet.end) * MINUTE;
  const midnight = localMidnight(instant, zone);
  const intoDay = localOffsetIntoDay(instant, zone);
  let startWall = midnight + start;
  let endWall = midnight + end;
  if (start > end) {
    if (intoDay < end) startWall -= DAY;
    else endWall += DAY;
  }
  return { start: wallToInstant(startWall, zone), end: wallToInstant(endWall, zone) };
}

export interface PlanInput {
  timing: NotificationTiming;
  channels: readonly NotificationChannel[];
  sendAt: Date;
  now: Date;
  skipAfter?: Date;
  quiet: QuietHours;
  timeZone: string;
}

export interface PlannedChannel {
  channel: NotificationChannel;
  scheduledFor: Date;
  skipped: boolean;
}

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

function heldUntil(input: PlanInput, channel: NotificationChannel): Date {
  const { timing, sendAt, now, quiet, timeZone } = input;
  const at = later(sendAt, now);
  if (channel === 'email' || timing === 'immediate') return at;
  if (timing === 'advanced') {
    const window = quietWindowAt(sendAt, quiet, timeZone);
    return window ? later(new Date(window.start.getTime() - MINUTE), now) : at;
  }
  return quietWindowAt(at, quiet, timeZone)?.end ?? at;
}

function nightChannel(input: PlanInput): NotificationChannel {
  return isQuiet(later(input.sendAt, input.now), input.quiet, input.timeZone) ? 'email' : 'push';
}

export function planChannels(input: PlanInput): PlannedChannel[] {
  const channels =
    input.timing === 'email_only_at_night'
      ? input.channels.filter((channel) => channel === nightChannel(input))
      : [...new Set(input.channels)];
  return channels.map((channel) => {
    const scheduledFor = heldUntil(input, channel);
    const skipped =
      input.skipAfter !== undefined && scheduledFor.getTime() >= input.skipAfter.getTime();
    return { channel, scheduledFor, skipped };
  });
}

export interface MomentInput {
  timing: NotificationTiming;
  sendAt: Date;
  quiet: QuietHours;
  timeZone: string;
}

const EARLIEST = new Date(-8_640_000_000_000_000);

export function plannedMoment(input: MomentInput): Date {
  const [push] = planChannels({ ...input, channels: ['push'], now: EARLIEST });
  return push?.scheduledFor ?? input.sendAt;
}

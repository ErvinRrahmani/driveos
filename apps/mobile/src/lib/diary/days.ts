import { dayKey } from '../format';

const DAY_MS = 86_400_000;

const parseDay = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
const formatDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayIn(now: Date, timeZone: string): string {
  return dayKey(now.toISOString(), timeZone);
}

export function addDays(day: string, days: number): string {
  return formatDay(parseDay(day) + days * DAY_MS);
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );
  const local = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return local - (instant - (instant % 1000));
}

function localMidnight(day: string, timeZone: string): number {
  const wall = parseDay(day);
  const guess = wall - offsetMs(wall, timeZone);
  return wall - offsetMs(guess, timeZone);
}

export function dayRange(day: string, timeZone: string): { from: string; to: string } {
  return {
    from: new Date(localMidnight(day, timeZone)).toISOString(),
    to: new Date(localMidnight(addDays(day, 1), timeZone)).toISOString(),
  };
}

export function weekOf(day: string): string[] {
  const weekday = new Date(parseDay(day)).getUTCDay();
  const monday = addDays(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

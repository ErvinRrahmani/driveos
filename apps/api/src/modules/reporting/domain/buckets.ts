export type Bucket = 'day' | 'week' | 'month';

const MINUTE = 60_000;
const DAY = 86_400_000;

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

function wallMs(date: string, time: string): number {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

export function localDayOf(instant: Date, zone: string): string {
  return new Date(wallClockMs(instant.getTime(), zone)).toISOString().slice(0, 10);
}

export function localToUtc(date: string, time: string, zone: string): Date {
  const wall = wallMs(date, time);
  const exact = [offsetMs(wall - DAY / 2, zone), offsetMs(wall + DAY / 2, zone)]
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

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function periodOf(day: string, bucket: Bucket): string {
  if (bucket === 'week') return addDays(day, 1 - isoWeekday(day));
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  return day;
}

export function periodsBetween(from: string, to: string, bucket: Bucket): string[] {
  const periods: string[] = [];
  for (const day of daysBetween(from, to)) {
    const period = periodOf(day, bucket);
    if (periods.at(-1) !== period) periods.push(period);
  }
  return periods;
}

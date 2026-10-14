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

function candidates(wall: number, zone: string): number[] {
  const offsets = new Set([offsetMs(wall - DAY / 2, zone), offsetMs(wall + DAY / 2, zone)]);
  return [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => wallClockMs(instant, zone) === wall)
    .sort((a, b) => a - b);
}

export function localToUtc(date: string, time: string, zone: string): Date | null {
  const [first] = candidates(wallMs(date, time), zone);
  return first === undefined ? null : new Date(first);
}

export function localToUtcOrTransition(date: string, time: string, zone: string): Date {
  const wall = wallMs(date, time);
  const [first] = candidates(wall, zone);
  if (first !== undefined) return new Date(first);
  let before = wall - offsetMs(wall + DAY / 2, zone);
  let after = wall - offsetMs(wall - DAY / 2, zone);
  while (after - before > MINUTE) {
    const middle = before + Math.floor((after - before) / 2 / MINUTE) * MINUTE;
    if (wallClockMs(middle, zone) < wall) before = middle;
    else after = middle;
  }
  return new Date(after);
}

export function localDateOf(instant: Date, zone: string): string {
  return new Date(wallClockMs(instant.getTime(), zone)).toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function localMinuteOfDay(instant: Date, zone: string): number {
  const wall = new Date(wallClockMs(instant.getTime(), zone));
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

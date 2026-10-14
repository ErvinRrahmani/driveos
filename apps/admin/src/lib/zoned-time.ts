const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(epoch: number, timeZone: string) {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(epoch))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function epochOfDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function offsetAt(epoch: number, timeZone: string): number {
  const clock = wallClock(epoch, timeZone);
  const asUtc =
    epochOfDate(clock.date) + (clock.hour * 60 + clock.minute) * MINUTE + clock.second * 1000;
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

export function addDays(date: string, days: number): string {
  return new Date(epochOfDate(date) + days * DAY).toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const day = new Date(epochOfDate(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfIsoWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function parseMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function zonedParts(iso: string, timeZone: string): { date: string; minutes: number } {
  const clock = wallClock(Date.parse(iso), timeZone);
  return { date: clock.date, minutes: clock.hour * 60 + clock.minute };
}

export function zonedToUtc(date: string, minutes: number, timeZone: string): string {
  const naive = epochOfDate(date) + minutes * MINUTE;
  const candidates = [naive - DAY / 2, naive + DAY / 2].map(
    (probe) => naive - offsetAt(probe, timeZone),
  );
  const exact = candidates.filter((epoch) => {
    const clock = wallClock(epoch, timeZone);
    return clock.date === date && clock.hour * 60 + clock.minute === minutes;
  });
  return new Date(Math.min(...(exact.length ? exact : candidates))).toISOString();
}

export function todayIn(timeZone: string, now: Date): string {
  return wallClock(now.getTime(), timeZone).date;
}

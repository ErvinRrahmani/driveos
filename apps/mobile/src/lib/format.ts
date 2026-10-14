import type { TFunction } from 'i18next';

export function formatMoney(minor: number, currency: string, locale?: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** digits);
}

export function formatDuration(t: TFunction, minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const total = Math.abs(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return sign + t('units.minutes', { count: rest });
  if (rest === 0) return sign + t('units.hours', { count: hours });
  return sign + t('units.hoursMinutes', { hours, minutes: rest });
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

export function dayKey(iso: string, timeZone: string): string {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function groupByDay<T extends { start: string }>(
  items: readonly T[],
  timeZone: string,
): { day: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    const day = dayKey(item.start, timeZone);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, grouped]) => ({ day, items: grouped }));
}

export function splitLessons<T extends { start: string; end: string; status: string }>(
  lessons: readonly T[],
  now: number,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const lesson of lessons) {
    if (lesson.status === 'booked' && Date.parse(lesson.end) > now) upcoming.push(lesson);
    else past.push(lesson);
  }
  upcoming.sort((a, b) => a.start.localeCompare(b.start));
  past.sort((a, b) => b.start.localeCompare(a.start));
  return { upcoming, past };
}

export function formatDateTime(iso: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatDay(day: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${day}T12:00:00.000Z`));
}

export function formatDate(iso: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium' }).format(new Date(iso));
}

const LOCALE = 'en';

export function formatPercentFromBasisPoints(basisPoints: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 }).format(
    basisPoints / 10_000,
  );
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

export function previousMonth(now: Date): string {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatPlainDay(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateTimeIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatPlainDate(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

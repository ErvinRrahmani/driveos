import { customType } from 'drizzle-orm/pg-core';

export interface Period {
  start: Date;
  end: Date;
}

const RANGE = /^\["?([^",]+)"?,"?([^",]+)"?\)$/;
const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:([+-]\d{2})(?::?(\d{2}))?)?$/;

function parseTimestamp(text: string, raw: string): Date {
  const match = TIMESTAMP.exec(text);
  if (!match) throw new Error(`Unsupported tstzrange bound in ${raw}`);
  const [, day, time, hours, minutes] = match;
  const offset = hours ? `${hours}:${minutes ?? '00'}` : 'Z';
  const date = new Date(`${day}T${time}${offset}`);
  if (Number.isNaN(date.getTime())) throw new Error(`Unsupported tstzrange bound in ${raw}`);
  return date;
}

export function parseTstzRange(raw: string): Period {
  const match = RANGE.exec(raw.trim());
  if (!match?.[1] || !match[2]) throw new Error(`Unsupported tstzrange value ${raw}`);
  return { start: parseTimestamp(match[1], raw), end: parseTimestamp(match[2], raw) };
}

export function serializeTstzRange(period: Period): string {
  if (period.end.getTime() <= period.start.getTime()) {
    throw new Error('A tstzrange period must end after it starts');
  }
  return `[${period.start.toISOString()},${period.end.toISOString()})`;
}

export const tstzrange = customType<{ data: Period; driverData: string }>({
  dataType: () => 'tstzrange',
  toDriver: serializeTstzRange,
  fromDriver: parseTstzRange,
});

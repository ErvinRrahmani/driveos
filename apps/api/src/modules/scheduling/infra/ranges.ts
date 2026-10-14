import { z } from 'zod';
import { invalidField } from '../../../kernel/http/errors.js';
import type { Period } from '../domain/period.js';

const DAY = 86_400_000;
const CURSOR = z.object({ start: z.iso.datetime(), id: z.uuid() });

export function boundedRange(from: string, to: string, maxDays: number): Period {
  const range = { start: new Date(from), end: new Date(to) };
  if (range.end.getTime() - range.start.getTime() > maxDays * DAY) {
    throw invalidField(['to'], `The range must not be longer than ${maxDays} days`);
  }
  return range;
}

export function encodeCalendarCursor(start: Date, id: string): string {
  return `${start.toISOString()}_${id}`;
}

export function decodeCalendarCursor(
  cursor: string | undefined,
): { start: Date; id: string } | undefined {
  if (cursor === undefined) return undefined;
  const [start, id] = cursor.split('_');
  const parsed = CURSOR.safeParse({ start, id });
  if (!parsed.success) throw invalidField(['cursor'], 'Unknown cursor');
  return { start: new Date(parsed.data.start), id: parsed.data.id };
}

import { z } from 'zod';
import { invalidField } from './errors.js';

const uuid = z.uuid();

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function idCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  if (!uuid.safeParse(cursor).success) throw invalidField(['cursor'], 'Unknown cursor');
  return cursor;
}

export function pageOf<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => string,
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? cursorOf(last) : null };
}

import { z } from 'zod';
import { addDays, zonedToUtc } from './zoned-time';

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const dateParam = () => z.string().regex(ISO_DATE).optional().catch(undefined);

export function instantRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): { from?: string; to?: string } {
  if (from !== undefined && to !== undefined && from > to) return {};
  return {
    from: from === undefined ? undefined : zonedToUtc(from, 0, timeZone),
    to: to === undefined ? undefined : zonedToUtc(addDays(to, 1), 0, timeZone),
  };
}

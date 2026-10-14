import { z } from 'zod';

export const cursorPageQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export const commandResultSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export type CommandResultResponse = z.infer<typeof commandResultSchema>;

export const PAGE_LIMIT_MAX = 200;
export const PAGE_LIMIT_DEFAULT = 50;

export const pageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageResponseSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export const idParamsSchema = z.object({ id: z.uuid() });
export type IdParams = z.infer<typeof idParamsSchema>;

export const dateTimeSchema = z.iso.datetime();
export const dateSchema = z.iso.date();
export const localTimeSchema = z.iso.time({ precision: -1 });
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const weekdaySchema = z.number().int().min(1).max(7);
export const minutesSchema = z.number().int();
export const positiveMinutesSchema = z.number().int().positive();
export const amountMinorSchema = z.number().int();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
export const localeSchema = z.string().trim().min(2).max(35);
export const timeZoneSchema = z.string().min(1).max(64);
export const licenceClassSchema = z.string().trim().min(1).max(10);
export const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/);
export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);
export const basisPointsSchema = z.number().int();
export const booleanQuerySchema = z.enum(['true', 'false']);

export function hasSomeField(body: Record<string, unknown>): boolean {
  return Object.values(body).some((value) => value !== undefined);
}

export const NO_FIELDS_MESSAGE = 'Give at least one field to change';

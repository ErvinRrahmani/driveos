import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;

export const listSearchSchema = z.object({
  cursor: z.string().min(1).max(512).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(200).optional().catch(undefined),
});
export type ListSearch = z.output<typeof listSearchSchema>;

export function parseListSearch(search: Record<string, unknown>): ListSearch {
  return listSearchSchema.parse(search);
}

export function pageQuery(search: ListSearch) {
  return { cursor: search.cursor, limit: search.limit ?? DEFAULT_PAGE_SIZE };
}

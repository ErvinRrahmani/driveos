import pg from 'pg';

export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

export function findPgError(err: unknown): pg.DatabaseError | undefined {
  for (let current = err; current instanceof Error; current = current.cause) {
    if (current instanceof pg.DatabaseError) return current;
  }
  return undefined;
}

export function isStillReferenced(error: pg.DatabaseError): boolean {
  return error.code === PG_FOREIGN_KEY_VIOLATION && /is still referenced/.test(error.detail ?? '');
}

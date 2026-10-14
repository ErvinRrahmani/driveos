import type pg from 'pg';

export interface Tenant {
  schoolId?: string;
  userId?: string;
}

export async function inTransaction<T>(
  client: pg.Client,
  tenant: Tenant,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    if (tenant.schoolId) {
      await client.query(`select set_config('app.school_id', $1, true)`, [tenant.schoolId]);
    }
    if (tenant.userId) {
      await client.query(`select set_config('app.user_id', $1, true)`, [tenant.userId]);
    }
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

export async function attempt(client: pg.Client, sql: string, params: unknown[] = []) {
  await client.query('savepoint attempt');
  try {
    const result = await client.query(sql, params);
    await client.query('release savepoint attempt');
    return { rowCount: result.rowCount, rows: result.rows, code: undefined, message: undefined };
  } catch (error) {
    await client.query('rollback to savepoint attempt');
    const { code, message } = error as { code?: string; message?: string };
    return { rowCount: null, rows: [], code, message };
  }
}

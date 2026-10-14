import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClients, type DatabaseClients } from '../../src/kernel/db/clients.js';
import { createScratchDatabase, type ScratchDatabase } from './scratch-database.js';

describe('database clients', () => {
  let db: ScratchDatabase;
  let clients: DatabaseClients;

  beforeAll(async () => {
    db = await createScratchDatabase({ migrate: false });
    clients = createDatabaseClients({
      DATABASE_URL: db.appUrl,
      DATABASE_SYSTEM_URL: db.systemUrl,
    });
  }, 60_000);

  afterAll(async () => {
    await clients?.close();
    await db?.drop();
  });

  it('connects the app pool as app_rw', async () => {
    const result = await clients.app.execute<{ user: string }>(sql`select current_user as user`);
    expect(result.rows).toEqual([{ user: 'app_rw' }]);
  });

  it('connects the system pool as app_system', async () => {
    const result = await clients.system.execute<{ user: string }>(sql`select current_user as user`);
    expect(result.rows).toEqual([{ user: 'app_system' }]);
  });

  it('opens no connection until the first query', () => {
    const lazy = createDatabaseClients({
      DATABASE_URL: 'postgres://app_rw:x@127.0.0.1:1/none',
      DATABASE_SYSTEM_URL: 'postgres://app_system:x@127.0.0.1:1/none',
    });
    expect(lazy.appPool.totalCount).toBe(0);
    expect(lazy.systemPool.totalCount).toBe(0);
    return lazy.close();
  });
});

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseClients,
  type DatabaseClients,
  type PoolErrorHandler,
} from '../../src/kernel/db/clients.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';

describe('database pool errors', () => {
  let db: ScratchDatabase;
  let clients: DatabaseClients;
  const onPoolError = vi.fn<PoolErrorHandler>();

  beforeAll(async () => {
    db = await createScratchDatabase({ migrate: false });
    clients = createDatabaseClients(
      { DATABASE_URL: db.appUrl, DATABASE_SYSTEM_URL: db.systemUrl },
      { onPoolError },
    );
  }, 60_000);

  afterAll(async () => {
    await clients?.close();
    await db?.drop();
  });

  it.each(['app', 'system'] as const)(
    'survives the %s pool backend being terminated and reconnects',
    async (role) => {
      onPoolError.mockClear();
      const database = role === 'app' ? clients.app : clients.system;
      const before = await database.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      const pid = before.rows[0]?.pid;
      expect(pid).toEqual(expect.any(Number));

      const admin = await connect(db.adminUrl);
      try {
        await admin.query('select pg_terminate_backend($1)', [pid]);
      } finally {
        await admin.end();
      }

      await vi.waitFor(() => expect(onPoolError).toHaveBeenCalledTimes(1), { timeout: 5_000 });
      expect(onPoolError).toHaveBeenCalledWith(
        role,
        expect.objectContaining({ message: expect.stringMatching(/terminating connection/) }),
      );

      const after = await database.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      expect(after.rows[0]?.pid).not.toBe(pid);
    },
  );
});

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Env } from '../config/env.js';

export type Database = NodePgDatabase;

export type PoolRole = 'app' | 'system';

export type PoolErrorHandler = (role: PoolRole, error: Error) => void;

export interface DatabaseClientsOptions {
  onPoolError?: PoolErrorHandler;
}

export interface DatabaseClients {
  app: Database;
  system: Database;
  appPool: pg.Pool;
  systemPool: pg.Pool;
  close(): Promise<void>;
}

const logPoolError: PoolErrorHandler = (role, error) => {
  console.error(
    JSON.stringify({ level: 'error', msg: 'database pool error', role, error: error.message }),
  );
};

export function createDatabaseClients(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_SYSTEM_URL'>,
  options: DatabaseClientsOptions = {},
): DatabaseClients {
  const onPoolError = options.onPoolError ?? logPoolError;
  const appPool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const systemPool = new pg.Pool({ connectionString: env.DATABASE_SYSTEM_URL });
  appPool.on('error', (error) => onPoolError('app', error));
  systemPool.on('error', (error) => onPoolError('system', error));
  return {
    app: drizzle(appPool),
    system: drizzle(systemPool),
    appPool,
    systemPool,
    close: async () => {
      await Promise.all([appPool.end(), systemPool.end()]);
    },
  };
}

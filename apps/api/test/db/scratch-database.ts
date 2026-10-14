import { randomBytes } from 'node:crypto';
import pg from 'pg';
import {
  bootstrap,
  createDatabase,
  dropDatabase,
  loadDbToolEnv,
  migrateDatabase,
  withDatabase,
} from '../../scripts/db/lib.js';

export interface ScratchDatabase {
  name: string;
  ownerUrl: string;
  appUrl: string;
  systemUrl: string;
  adminUrl: string;
  drop(): Promise<void>;
}

export async function createScratchDatabase(options: { migrate?: boolean } = {}) {
  const env = loadDbToolEnv();
  const name = `driveos_test_${randomBytes(6).toString('hex')}`;
  await createDatabase(env, name);
  await bootstrap(env, name);
  const ownerUrl = withDatabase(env.DATABASE_OWNER_URL, name);
  if (options.migrate ?? true) await migrateDatabase(ownerUrl);
  const scratch: ScratchDatabase = {
    name,
    ownerUrl,
    appUrl: withDatabase(env.DATABASE_URL, name),
    systemUrl: withDatabase(env.DATABASE_SYSTEM_URL, name),
    adminUrl: withDatabase(env.DATABASE_ADMIN_URL, name),
    drop: () => dropDatabase(env, name),
  };
  return scratch;
}

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

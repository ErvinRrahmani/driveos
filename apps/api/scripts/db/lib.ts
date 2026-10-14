import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { type DbToolEnv, parseDbToolEnv } from '../../src/kernel/config/env.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIGRATIONS_FOLDER = path.join(API_ROOT, 'drizzle');
const MAINTENANCE_DATABASE = 'postgres';
const BOOTSTRAP_LOCK = 'driveos:db:bootstrap';

export const ROLES = {
  owner: { name: 'driveos_owner', envKey: 'DATABASE_OWNER_URL', bypassRls: false },
  app: { name: 'app_rw', envKey: 'DATABASE_URL', bypassRls: false },
  system: { name: 'app_system', envKey: 'DATABASE_SYSTEM_URL', bypassRls: true },
} as const;

export const DEFINER_ROLE = 'driveos_definer';

export function loadDbToolEnv(): DbToolEnv {
  const envFile = path.join(API_ROOT, '.env');
  process.loadEnvFile(existsSync(envFile) ? envFile : path.join(API_ROOT, '.env.example'));
  return parseDbToolEnv(process.env);
}

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function databaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name) throw new Error(`No database name in ${new URL(url).origin}`);
  return name;
}

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function maintenanceUrl(env: DbToolEnv): string {
  return withDatabase(env.DATABASE_ADMIN_URL, MAINTENANCE_DATABASE);
}

function credentials(env: DbToolEnv, role: (typeof ROLES)[keyof typeof ROLES]) {
  const url = new URL(env[role.envKey]);
  const user = decodeURIComponent(url.username);
  if (user !== role.name) {
    throw new Error(`${role.envKey} must connect as ${role.name}, not ${user || '(none)'}`);
  }
  const password = decodeURIComponent(url.password);
  if (!password) throw new Error(`${role.envKey} has no password`);
  return password;
}

async function ensureRoles(client: pg.Client, env: DbToolEnv): Promise<void> {
  for (const role of Object.values(ROLES)) {
    const password = client.escapeLiteral(credentials(env, role));
    const attributes = [
      'LOGIN',
      'NOSUPERUSER',
      'NOCREATEDB',
      'NOCREATEROLE',
      'NOREPLICATION',
      'INHERIT',
      role.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS',
      `PASSWORD ${password}`,
    ].join(' ');
    const exists = await client.query('select 1 from pg_roles where rolname = $1', [role.name]);
    const verb = exists.rowCount ? 'ALTER' : 'CREATE';
    await client.query(`${verb} ROLE ${client.escapeIdentifier(role.name)} WITH ${attributes}`);
  }
}

async function ensureDefinerRole(client: pg.Client): Promise<void> {
  const attributes =
    'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT BYPASSRLS PASSWORD NULL';
  const exists = await client.query('select 1 from pg_roles where rolname = $1', [DEFINER_ROLE]);
  await client.query(
    `${exists.rowCount ? 'ALTER' : 'CREATE'} ROLE ${DEFINER_ROLE} WITH ${attributes}`,
  );
  const granted = await client.query(
    `select 1 from pg_auth_members
      where roleid = $1::regrole and member = $2::regrole`,
    [DEFINER_ROLE, ROLES.owner.name],
  );
  if (!granted.rowCount) await client.query(`GRANT ${DEFINER_ROLE} TO ${ROLES.owner.name}`);
}

export async function bootstrap(env: DbToolEnv, database: string): Promise<void> {
  await withClient(maintenanceUrl(env), async (client) => {
    await client.query('select pg_advisory_lock(hashtext($1))', [BOOTSTRAP_LOCK]);
    try {
      await ensureRoles(client, env);
      await ensureDefinerRole(client);
      const db = client.escapeIdentifier(database);
      await client.query(`ALTER DATABASE ${db} OWNER TO ${ROLES.owner.name}`);
      await client.query(
        `GRANT CONNECT ON DATABASE ${db} TO ${ROLES.app.name}, ${ROLES.system.name}`,
      );
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [BOOTSTRAP_LOCK]);
    }
  });
}

export async function migrateDatabase(ownerUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

export async function dropDatabase(env: DbToolEnv, database: string): Promise<void> {
  await withClient(maintenanceUrl(env), (client) =>
    client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(database)} WITH (FORCE)`),
  );
}

export async function createDatabase(env: DbToolEnv, database: string): Promise<void> {
  await withClient(maintenanceUrl(env), (client) =>
    client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`),
  );
}

export async function resetDatabase(env: DbToolEnv, database: string): Promise<void> {
  await dropDatabase(env, database);
  await createDatabase(env, database);
  await bootstrap(env, database);
  await migrateDatabase(withDatabase(env.DATABASE_OWNER_URL, database));
}

import { databaseName, loadDbToolEnv, resetDatabase } from './lib.js';

const env = loadDbToolEnv();
const database = databaseName(env.DATABASE_URL);
if (databaseName(env.DATABASE_OWNER_URL) !== database) {
  throw new Error('DATABASE_URL and DATABASE_OWNER_URL must name the same database');
}
await resetDatabase(env, database);
process.stdout.write(`Reset database ${database}: dropped, recreated, bootstrapped, migrated\n`);

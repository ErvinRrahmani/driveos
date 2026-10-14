import { databaseName, loadDbToolEnv, migrateDatabase } from './lib.js';

const env = loadDbToolEnv();
await migrateDatabase(env.DATABASE_OWNER_URL);
process.stdout.write(`Migrated database ${databaseName(env.DATABASE_OWNER_URL)}\n`);

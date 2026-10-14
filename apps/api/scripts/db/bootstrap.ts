import { bootstrap, databaseName, loadDbToolEnv } from './lib.js';

const env = loadDbToolEnv();
const database = databaseName(env.DATABASE_URL);
await bootstrap(env, database);
process.stdout.write(`Bootstrapped roles and ownership for database ${database}\n`);

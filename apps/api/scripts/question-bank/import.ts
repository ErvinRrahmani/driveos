import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { importQuestionPackRequestSchema } from '@driveos/shared';
import { JsonQuestionBankImporter } from '../../src/adapters/question-bank/json-question-bank-importer.js';
import type { Principal } from '../../src/kernel/auth/principal.js';
import { EventPublisher } from '../../src/kernel/cqrs/index.js';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { ApiError } from '../../src/kernel/http/api-error.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { ImportQuestionPackCommand } from '../../src/modules/theory/commands/import-question-pack.command.js';
import { ImportQuestionPackHandler } from '../../src/modules/theory/commands/import-question-pack.handler.js';
import { PublishQuestionPackCommand } from '../../src/modules/theory/commands/publish-question-pack.command.js';
import { PublishQuestionPackHandler } from '../../src/modules/theory/commands/publish-question-pack.handler.js';
import { QuestionPacksRepository } from '../../src/modules/theory/infra/question-packs.repository.js';
import { databaseName, loadDbToolEnv } from '../db/lib.js';

const USAGE = 'Usage: pnpm --filter @driveos/api question-bank:import <pack.json> [--publish]';

const CLI_OPERATOR: Principal = {
  userId: '',
  schoolId: null,
  membershipId: null,
  roles: ['platform_admin'],
  tokenType: 'access',
  sessionId: null,
};

function resolvePackFile(file: string): string {
  const candidates = [path.resolve(file), path.resolve(process.env.INIT_CWD ?? '.', file)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Question pack file not found: ${file}`);
  return found;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { publish: { type: 'boolean', default: false } },
});
const [file] = positionals;
if (!file || positionals.length > 1) fail(USAGE);

const parsed = importQuestionPackRequestSchema.safeParse(
  JSON.parse(await readFile(resolvePackFile(file), 'utf8')),
);
if (!parsed.success) {
  fail(
    `Invalid question pack:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
  );
}

const env = loadDbToolEnv();
const database = new DatabaseService(env);
const tenant = new TenantContext(database);
const packs = new QuestionPacksRepository(tenant);
const importer = new ImportQuestionPackHandler(packs, new JsonQuestionBankImporter());
const publisher = new PublishQuestionPackHandler(packs, new EventPublisher(tenant));

try {
  const result = await tenant.runInTenant({ schoolId: null, userId: null }, async () => {
    const imported = await importer.execute(
      new ImportQuestionPackCommand(CLI_OPERATOR, parsed.data),
    );
    if (values.publish) {
      await publisher.execute(new PublishQuestionPackCommand(CLI_OPERATOR, imported.id));
    }
    return imported;
  });
  process.stdout.write(
    `${values.publish ? 'Imported and published' : 'Imported draft'} question pack ${result.id} ` +
      `(version ${result.version}, ${result.questionCount} questions) into ${databaseName(env.DATABASE_URL)}\n`,
  );
} catch (error) {
  if (!(error instanceof ApiError)) throw error;
  process.exitCode = 1;
  process.stderr.write(
    `${error.code}: ${error.message}${error.details ? `\n${JSON.stringify(error.details, null, 2)}` : ''}\n`,
  );
} finally {
  await database.close();
}

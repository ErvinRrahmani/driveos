import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseService } from '../../src/kernel/db/database.service.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { databaseName, loadDbToolEnv } from './lib.js';
import {
  BRANCHES,
  LEADS,
  LESSON_TYPES,
  PASSED_PRACTICAL,
  PRICE_LISTS,
  PUBLIC_PROFILE,
  REVIEW,
  SEED,
  SEPTEMBER_GROWTH_REPORT,
  VEHICLES,
} from './seed-data.js';
import { fixtureId, type SeedLogin, seedDatabase } from './seeder.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const LOGINS_FILE = path.join(REPO_ROOT, '.context', 'seed-logins.md');

function table(headers: string[], rows: (string | null)[][]): string {
  const line = (cells: (string | null)[]) => `| ${cells.map((c) => c ?? '-').join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function loginsTable(logins: SeedLogin[]): string {
  return table(
    ['Name', 'Role', 'Phone', 'Email', 'School', 'School id', 'Membership id', 'User id'],
    logins.map((l) => [
      l.name,
      `${l.label} (${l.roles.join(', ')})`,
      l.phone,
      l.email,
      l.schoolName,
      l.schoolId,
      l.membershipId,
      l.userId,
    ]),
  );
}

function fixturesTable(): string {
  const rows: string[][] = [];
  for (const key of ['berlin', 'lisbon'] as const) {
    const school = SEED.schools[key];
    rows.push([school.name, 'school', school.id, school.timeZone]);
    rows.push([school.name, 'branch', BRANCHES[key].id, BRANCHES[key].name]);
    for (const vehicle of VEHICLES.filter((v) => v.schoolId === school.id)) {
      rows.push([school.name, 'vehicle', vehicle.id, vehicle.plate]);
    }
    LESSON_TYPES.forEach((type, i) =>
      rows.push([school.name, 'lesson type', fixtureId('lessonType', key, i), type.name]),
    );
    PRICE_LISTS[key].forEach((item, i) =>
      rows.push([
        school.name,
        'price item',
        fixtureId('priceItem', key, i),
        item.showOnPublicPage ? `${item.name} (on the public page)` : item.name,
      ]),
    );
  }
  for (const [key, student] of Object.entries(SEED.students)) {
    rows.push([SEED.schools.berlin.name, 'student', student.id, key]);
  }
  const berlin = SEED.schools.berlin.name;
  rows.push([
    berlin,
    'public page',
    SEED.schools.berlin.id,
    `/s/${PUBLIC_PROFILE.slug} (published, WhatsApp ${PUBLIC_PROFILE.whatsappNumber ?? '-'})`,
  ]);
  rows.push([berlin, 'review', REVIEW.id, `${REVIEW.displayName} (${REVIEW.status})`]);
  rows.push([
    berlin,
    'test attempt',
    PASSED_PRACTICAL.id,
    `${PASSED_PRACTICAL.student}: ${PASSED_PRACTICAL.kind} ${PASSED_PRACTICAL.result}`,
  ]);
  for (const lead of Object.values(LEADS)) {
    rows.push([berlin, 'lead', lead.id, `${lead.fullName} (${lead.status}, ${lead.source})`]);
  }
  rows.push([berlin, 'growth report', SEPTEMBER_GROWTH_REPORT.id, 'September 2026 (leads funnel)']);
  rows.push(['(global)', 'question pack', SEED.questionPack.id, SEED.questionPack.file]);
  for (const plan of Object.values(SEED.plans)) rows.push(['(global)', 'plan', plan.id, plan.code]);
  return table(['School', 'Entity', 'Id', 'Name'], rows);
}

const env = loadDbToolEnv();
const database = new DatabaseService(env);
try {
  const result = await seedDatabase(new TenantContext(database), { today: new Date() });
  const logins = loginsTable(result.logins);
  process.stdout.write(`Seeded database ${databaseName(env.DATABASE_URL)}\n\n${logins}\n`);
  const doc = [
    '# Seed fixture reference',
    '',
    'Written by `pnpm --filter @driveos/api db:seed`. Fixed ids; re-running the seed changes nothing.',
    'Sign in with a one-time code: `POST /v1/auth/code {"contact": "<phone or email>"}`, then `POST /v1/auth/verify {"contact", "code", "client": "web"}`.',
    'Phone codes appear in the api console log (`sms (console adapter)`); email codes in Mailpit (http://localhost:18025, `MAILPIT_UI_PORT`).',
    'Send the returned `accessToken` as `Authorization: Bearer <token>`. The `X-Dev-School`/`X-Dev-User` headers work only under `NODE_ENV=test`.',
    '',
    '## Logins',
    '',
    logins,
    '',
    '## Other fixtures',
    '',
    fixturesTable(),
    '',
  ].join('\n');
  await mkdir(path.dirname(LOGINS_FILE), { recursive: true });
  await writeFile(LOGINS_FILE, doc);
  process.stdout.write(`\nFixture reference written to ${LOGINS_FILE}\n`);
} finally {
  await database.close();
}

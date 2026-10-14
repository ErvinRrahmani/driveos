import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';
import { moduleBoundaries } from '../src/module-boundaries.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
});

const file = '/repo/apps/api/src/modules/scheduling/commands/book-lesson.handler.ts';
const schemaFile = '/repo/apps/api/src/modules/scheduling/infra/schema.ts';
const moduleFile = '/repo/apps/api/src/modules/scheduling/scheduling.module.ts';
const workerModuleFile = '/repo/apps/api/src/modules/scheduling/scheduling-worker.module.ts';

ruleTester.run('module-boundaries', moduleBoundaries, {
  valid: [
    { filename: file, code: "import { x } from '../domain/rules.js';" },
    { filename: file, code: "import { x } from '../../billing/index.js';" },
    { filename: file, code: "import { x } from '../../billing';" },
    { filename: file, code: "import { x } from '../../billing/index';" },
    { filename: file, code: "import { x } from '../../../kernel/event-publisher.js';" },
    { filename: file, code: "import { Injectable } from '@nestjs/common';" },
    { filename: file, code: "export * from '../../billing/index.js';" },
    {
      filename: '/repo/apps/api/src/kernel/app.module.ts',
      code: "import { x } from '../modules/billing/infra/schema.js';",
    },
    { filename: schemaFile, code: "import { schools } from '../../school/infra/schema.js';" },
    { filename: schemaFile, code: "import { schools } from '../../school/infra/schema';" },
    { filename: schemaFile, code: "import { schools } from '../../school/infra/schema.ts';" },
    {
      filename: moduleFile,
      code: "import { BillingModule } from '../billing/billing.module.js';",
    },
    {
      filename: workerModuleFile,
      code: "import { BillingWorkerModule } from '../billing/billing-worker.module.js';",
    },
  ],
  invalid: [
    {
      filename: file,
      code: "import { BillingModule } from '../../billing/billing.module.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: moduleFile,
      code: "import { PgLedgerWriter } from '../billing/infra/ledger-writer.impl.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: '/repo/apps/api/src/modules/scheduling/infra/scheduling.module.ts',
      code: "import { BillingModule } from '../../billing/billing.module.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: file,
      code: "import { ledgerEntries } from '../../billing/infra/schema.js';",
      errors: [{ messageId: 'deepImport', data: { from: 'scheduling', to: 'billing' } }],
    },
    {
      filename: file,
      code: "import type { X } from '../../billing/domain/ledger.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: file,
      code: "export { y } from '../../billing/commands/credit.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: file,
      code: "export * from '../../billing/queries/get-balance.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: file,
      code: "const m = await import('../../billing/infra/repo.js');",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: schemaFile,
      code: "import { x } from '../../billing/infra/repo.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: schemaFile,
      code: "import { x } from '../../billing/domain/ledger.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: '/repo/apps/api/src/modules/scheduling/infra/lesson.repository.ts',
      code: "import { students } from '../../training/infra/schema.js';",
      errors: [{ messageId: 'deepImport' }],
    },
    {
      filename: '/repo/apps/api/src/modules/scheduling/infra/schema.test.ts',
      code: "import { students } from '../../training/infra/schema.js';",
      errors: [{ messageId: 'deepImport' }],
    },
  ],
});

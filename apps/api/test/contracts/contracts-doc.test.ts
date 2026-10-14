import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as billing from '../../src/modules/billing/index.js';
import * as documents from '../../src/modules/documents/index.js';
import * as identity from '../../src/modules/identity/index.js';
import * as messaging from '../../src/modules/messaging/index.js';
import * as platform from '../../src/modules/platform/index.js';
import * as reporting from '../../src/modules/reporting/index.js';
import * as scheduling from '../../src/modules/scheduling/index.js';
import * as school from '../../src/modules/school/index.js';
import * as theory from '../../src/modules/theory/index.js';
import * as training from '../../src/modules/training/index.js';

const MODULES = {
  identity,
  school,
  platform,
  scheduling,
  training,
  theory,
  billing,
  documents,
  messaging,
  reporting,
};

const SERVICE_TOKENS = ['LEDGER_WRITER', 'AUDIT_WRITER'];

const doc = readFileSync(new URL('../../../../docs/CONTRACTS.md', import.meta.url), 'utf8');
const documented = new Set(
  [...doc.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1] ?? ''),
);

const isClass = (value: unknown) =>
  typeof value === 'function' && Function.prototype.toString.call(value).startsWith('class');

const publicNames = Object.entries(MODULES).flatMap(([module, exports]) =>
  Object.entries(exports)
    .filter(([name, value]) => isClass(value) || SERVICE_TOKENS.includes(name))
    .map(([name]) => ({ module, name })),
);

describe('docs/CONTRACTS.md', () => {
  it('names every public class and service token exported from a module index.ts', () => {
    const missing = publicNames.filter(({ name }) => !documented.has(name));
    expect(missing).toEqual([]);
  });

  it('names only commands and queries that a module index.ts exports', () => {
    const exported = new Set(publicNames.map(({ name }) => name));
    const unknown = [...documented].filter(
      (name) => /(Command|Query)$/.test(name) && !exported.has(name),
    );
    expect(unknown).toEqual([]);
  });
});

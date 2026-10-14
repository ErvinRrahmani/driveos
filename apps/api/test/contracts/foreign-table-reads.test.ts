import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulesDir = fileURLToPath(new URL('../../src/modules/', import.meta.url));

const FOREIGN_TABLES: Record<string, string[]> = {
  identity: ['students', 'guardian_links', 'student_instructors', 'school_settings', 'branches'],
  billing: ['students', 'guardian_links', 'student_instructors', 'enrolments', 'school_settings'],
};

function sourcesOf(module: string): { file: string; text: string }[] {
  const dir = join(modulesDir, module);
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('schema.ts'))
    .map((file) => ({ file: `${module}/${file}`, text: readFileSync(join(dir, file), 'utf8') }));
}

describe('no raw reads of another module’s tables', () => {
  it.each(Object.entries(FOREIGN_TABLES))(
    '%s reads foreign tables only through the bus',
    (module, tables) => {
      const pattern = new RegExp(`\\b(from|join|update|into)\\s+(${tables.join('|')})\\b`, 'i');
      const offenders = sourcesOf(module)
        .filter(({ text }) => pattern.test(text))
        .map(({ file }) => file);
      expect(offenders).toEqual([]);
    },
  );
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulesDir = fileURLToPath(new URL('../../src/modules', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const moduleNames = readdirSync(modulesDir).filter((name) =>
  statSync(join(modulesDir, name)).isDirectory(),
);

describe('module boundaries', () => {
  it.each(moduleNames)('modules/%s/index.ts exports contracts only, no Nest module', (name) => {
    const index = readFileSync(join(modulesDir, name, 'index.ts'), 'utf8');
    const moduleReExports = [...index.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1] ?? '')
      .filter((specifier) => /\.module(\.js)?$/.test(specifier));
    expect(moduleReExports).toEqual([]);
    expect(index).not.toMatch(/\b\w+Module\b/);
  });

  it('no forwardRef under src/modules', () => {
    const offenders = sourceFiles(modulesDir)
      .filter((file) => /\bforwardRef\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(modulesDir, file));
    expect(offenders).toEqual([]);
  });

  it('contract files never import handlers or Nest modules', () => {
    const contract = /\.(command|query)\.ts$/;
    const offenders = sourceFiles(modulesDir)
      .filter((file) => contract.test(file))
      .filter((file) =>
        /from\s+['"][^'"]*\.(handler|module|controller)\.js['"]/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(modulesDir, file));
    expect(offenders).toEqual([]);
  });
});

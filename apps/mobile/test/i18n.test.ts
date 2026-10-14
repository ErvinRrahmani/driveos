import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { i18n, pickLanguage } from '../src/lib/i18n';
import en from '../src/locales/en.json';

const ROOT = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function lookup(key: string): unknown {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function hasKey(key: string): boolean {
  if (typeof lookup(key) === 'string') return true;
  return typeof lookup(`${key}_one`) === 'string' && typeof lookup(`${key}_other`) === 'string';
}

const usedKeys = [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'src'))].flatMap(
  (file) =>
    [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"`]([\w.-]+)['"`]/g)].map((match) => ({
      file,
      key: match[1] ?? '',
    })),
);

describe('mobile i18n', () => {
  it('finds translated strings in the app', () => {
    expect(usedKeys.length).toBeGreaterThan(20);
  });

  it('has an English string for every t() key used in app/ and src/', () => {
    const missing = usedKeys.filter(({ key }) => !hasKey(key));
    expect(missing).toEqual([]);
  });

  it('resolves English strings', () => {
    expect(i18n.t('login.title')).toBe('Sign in to DriveOS');
  });

  it('resolves plural strings by count', () => {
    expect(i18n.t('studentHome.offersCount', { count: 1 })).toBe('1 open offer');
    expect(i18n.t('studentHome.offersCount', { count: 2 })).toBe('2 open offers');
  });

  it('picks the first supported device language and falls back to English', () => {
    expect(pickLanguage(['de', 'en'])).toBe('en');
    expect(pickLanguage(['pt'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
  });
});

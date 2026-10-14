export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'login',
  's',
  'docs',
  'platform',
  'www',
  'app',
]);

const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface SlugIssue {
  path: string[];
  message: string;
}

/** Problems with a public page slug: 3–40 lower-case letters, digits and inner hyphens, not reserved. */
export function slugIssues(slug: string): SlugIssue[] {
  if (RESERVED_SLUGS.has(slug)) return [{ path: ['slug'], message: 'Reserved' }];
  if (slug.length < 3 || slug.length > 40 || !SLUG.test(slug)) {
    return [{ path: ['slug'], message: 'Use 3–40 lower-case letters, digits and hyphens' }];
  }
  return [];
}

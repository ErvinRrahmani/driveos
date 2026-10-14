import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugIssues } from '../../../src/modules/school/domain/slug.js';

describe('slugIssues', () => {
  it.each(['fahrschule-spree', 'abc', 'a1-b2'])('accepts %s', (slug) => {
    expect(slugIssues(slug)).toEqual([]);
  });

  it.each(['ab', '-abc', 'abc-', 'Abc', 'a_b', 'a'.repeat(41)])('rejects %s', (slug) => {
    expect(slugIssues(slug)).not.toEqual([]);
  });

  it.each([...RESERVED_SLUGS])('rejects reserved %s', (slug) => {
    expect(slugIssues(slug)).toEqual([{ path: ['slug'], message: 'Reserved' }]);
  });
});

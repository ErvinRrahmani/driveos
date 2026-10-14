import { describe, expect, it } from 'vitest';
import { parseApiUrl } from '../src/config';

describe('parseApiUrl', () => {
  it('accepts an http url', () => {
    expect(parseApiUrl('http://localhost:13000')).toBe('http://localhost:13000');
  });

  it('fails loudly when EXPO_PUBLIC_API_URL is missing', () => {
    expect(() => parseApiUrl(undefined)).toThrow(/EXPO_PUBLIC_API_URL/);
  });
});

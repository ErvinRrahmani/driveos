import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../../src/lib/redirect';

describe('safeRedirect', () => {
  it('keeps in-app paths with their search', () => {
    expect(safeRedirect('/vehicles?cursor=2')).toBe('/vehicles?cursor=2');
  });

  it('falls back to the dashboard for missing, external or login targets', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('/login?redirect=%2F')).toBe('/');
  });
});

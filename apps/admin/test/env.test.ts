import { describe, expect, it } from 'vitest';
import { parseAdminEnv } from '../src/env';

describe('parseAdminEnv', () => {
  it('returns the API url with mocks off by default', () => {
    expect(parseAdminEnv({ VITE_API_URL: 'http://localhost:13000' })).toEqual({
      apiUrl: 'http://localhost:13000',
      useMocks: false,
    });
  });

  it('turns the mock API on with VITE_USE_MOCKS=true', () => {
    expect(
      parseAdminEnv({ VITE_API_URL: 'http://localhost:13000', VITE_USE_MOCKS: 'true' }).useMocks,
    ).toBe(true);
  });

  it('rejects a VITE_USE_MOCKS value other than true or false', () => {
    expect(() =>
      parseAdminEnv({ VITE_API_URL: 'http://localhost:13000', VITE_USE_MOCKS: 'yes' }),
    ).toThrow(/VITE_USE_MOCKS/);
  });

  it('names the missing variable', () => {
    expect(() => parseAdminEnv({})).toThrow(/VITE_API_URL/);
  });
});

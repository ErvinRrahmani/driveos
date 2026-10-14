import { createApiClient } from '@driveos/shared/client';
import { createMockApi, handlers, scenarios } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseUseMocks } from '../src/config';
import { startMocks } from '../src/mocks';
import { StatusCodes } from 'http-status-codes';

describe('parseUseMocks', () => {
  it('is off unless EXPO_PUBLIC_USE_MOCKS is true', () => {
    expect(parseUseMocks(undefined)).toBe(false);
    expect(parseUseMocks('false')).toBe(false);
    expect(parseUseMocks('true')).toBe(true);
  });

  it('fails loudly on another value', () => {
    expect(() => parseUseMocks('yes')).toThrow(/EXPO_PUBLIC_USE_MOCKS/);
  });
});

describe('startMocks', () => {
  it('does nothing when mocks are off', async () => {
    expect(await startMocks(false)).toBeNull();
  });

  it('serves the shared handlers through msw/native when mocks are on', async () => {
    const server = await startMocks(true);
    try {
      const response = await fetch('http://localhost:13000/v1/health');
      expect(await response.json()).toEqual({ status: 'ok', service: 'api' });
    } finally {
      server?.close();
    }
  });

  it('starts with nobody signed in so the app shows its login screen', async () => {
    const server = await startMocks(true);
    try {
      const response = await fetch('http://localhost:13000/v1/me');
      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    } finally {
      server?.close();
    }
  });
});

describe('shared mock API from the mobile app', () => {
  const server = setupServer(...createMockApi({ seed: scenarios.loggedInAs('student') }).handlers);
  const { fetchClient } = createApiClient({
    baseUrl: 'http://api.test',
    fetch: (request: Request) => fetch(request),
  });
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it('exports default handlers for every route', () => {
    expect(handlers.length).toBeGreaterThan(100);
  });

  it('answers GET /v1/me for the logged-in student', async () => {
    const { data } = await fetchClient.GET('/v1/me');
    expect(data?.user.fullName).toBe('Stella Student');
    expect(data?.active?.roles).toEqual(['student']);
  });
});

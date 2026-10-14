import { createMockApi, scenarios, type MockRole } from '@driveos/shared/mocks';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { setupServer } from 'msw/node';
import { App } from '../../src/app';
import { createAppRouter } from '../../src/router';
import { REFRESH_TOKEN_KEY } from '../../src/lib/auth-store';
import { createServices } from '../../src/lib/services';

export const API_BASE = 'http://api.test';

export const server = setupServer();

export function startServer() {
  server.listen({ onUnhandledRequest: 'error' });
}

export interface RenderAppOptions {
  path: string;
  as?: MockRole;
  configure?: (mock: ReturnType<typeof createMockApi>) => void;
  session?: { accessToken: string; refreshToken: string };
  strict?: boolean;
  reload?: boolean;
}

export function renderApp({
  path,
  as,
  configure,
  session,
  strict = false,
  reload = false,
}: RenderAppOptions) {
  const mock = createMockApi({ now: () => new Date('2026-10-08T08:00:00Z') });
  configure?.(mock);
  server.resetHandlers(...mock.handlers);
  const loggedIn = as ? scenarios.loggedInAs(as)(mock.store) : null;
  const stored = new Map<string, string>();
  if (loggedIn && reload) {
    stored.set(REFRESH_TOKEN_KEY, loggedIn.refreshToken);
    mock.store.currentAccessToken = null;
  }
  const services = createServices({
    baseUrl: API_BASE,
    storage: reload
      ? {
          getItem: (key) => stored.get(key) ?? null,
          setItem: (key, value) => void stored.set(key, value),
          removeItem: (key) => void stored.delete(key),
        }
      : null,
    refreshWhenTokenMissing: reload,
  });
  if (loggedIn && !reload) services.auth.setSession(loggedIn);
  if (!loggedIn) mock.store.sessions.clear();
  if (session) {
    services.auth.setSession({
      ...session,
      expiresIn: 900,
      memberships: [],
      activeMembershipId: null,
    });
  }
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(services, history);
  const app = <App router={router} services={services} />;
  const view = render(strict ? <StrictMode>{app}</StrictMode> : app);
  return { ...view, mock, services, router, history };
}

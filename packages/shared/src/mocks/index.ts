import type { HttpHandler } from 'msw';
import { createHandlers } from './handlers.js';
import { scenarios } from './scenarios.js';
import { MockStore } from './store.js';

export interface CreateMockApiOptions {
  seed?: (store: MockStore) => unknown;
  latencyMs?: number;
  now?: () => Date;
  baseUrl?: string;
}

export interface MockApi {
  handlers: HttpHandler[];
  store: MockStore;
  reset(): void;
}

export function createMockApi(options: CreateMockApiOptions = {}): MockApi {
  const store = new MockStore({ now: options.now, seed: options.seed });
  const handlers = createHandlers(store, {
    baseUrl: options.baseUrl ?? '*',
    latencyMs: options.latencyMs ?? 0,
  });
  return { handlers, store, reset: () => store.reset() };
}

export const mockApi = createMockApi({ seed: scenarios.loggedInAs('owner') });
export const handlers = mockApi.handlers;
export default handlers;

export { MOCK_ROUTES } from './generated/routes.js';
export { MOCK_LOGIN_CODE } from './identity.js';
export type { MockRoute } from './routes.js';
export { scenarios, type MockRole } from './scenarios.js';
export type { MockMembership, MockSession, MockStore, MockUser } from './store.js';

import { createApiClient } from '@driveos/shared/client';
import { createMockApi } from '@driveos/shared/mocks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiHealth } from '../src/components/api-status';
import { i18n } from '../src/i18n';

const BASE_URL = 'http://api.test';
const server = setupServer(...createMockApi().handlers);
const client = createApiClient({ baseUrl: BASE_URL, fetch: (request: Request) => fetch(request) });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHealth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ApiHealth client={client} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('ApiHealth against the shared mock API', () => {
  it('shows the API as up', async () => {
    renderHealth();
    expect(await screen.findByText('API is up')).toBeTruthy();
  });

  it('shows the API as unreachable when health fails', async () => {
    server.use(http.get(`${BASE_URL}/v1/health`, () => HttpResponse.error()));
    renderHealth();
    expect(await screen.findByText('API is unreachable')).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/client/index.js';

describe('createApiClient', () => {
  it('calls the typed health route on the configured base url', async () => {
    const seen: string[] = [];
    const { fetchClient } = createApiClient({
      baseUrl: 'http://api.test',
      fetch: async (request: Request) => {
        seen.push(`${request.method} ${request.url}`);
        return new Response(JSON.stringify({ status: 'ok', service: 'api' }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const { data } = await fetchClient.GET('/v1/health');

    expect(seen).toEqual(['GET http://api.test/v1/health']);
    expect(data?.status).toBe('ok');
  });
});

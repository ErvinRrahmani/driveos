import createFetchClient, { type ClientOptions } from 'openapi-fetch';
import createQueryHooks from 'openapi-react-query';
import type { paths } from './generated/schema.js';

export type { components, operations, paths } from './generated/schema.js';

export function createApiClient(options: ClientOptions) {
  const fetchClient = createFetchClient<paths>(options);
  return { fetchClient, $api: createQueryHooks(fetchClient) };
}

export type ApiClient = ReturnType<typeof createApiClient>;

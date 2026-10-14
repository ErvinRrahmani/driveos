import { QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/services';

describe('query client defaults', () => {
  it('does not retry endpoints that are not implemented yet', async () => {
    const { queryClient } = createServices({ baseUrl: 'http://api.test', storage: null });
    let calls = 0;
    const observer = new QueryObserver(queryClient, {
      queryKey: ['not-implemented'],
      queryFn: () => {
        calls += 1;
        return Promise.reject({
          error: { code: 'not_implemented', message: 'Not available yet' },
        });
      },
    });
    const settled = new Promise<void>((resolve) => {
      const unsubscribe = observer.subscribe((result) => {
        if (result.isError) {
          unsubscribe();
          resolve();
        }
      });
    });
    await settled;
    expect(calls).toBe(1);
  });
});

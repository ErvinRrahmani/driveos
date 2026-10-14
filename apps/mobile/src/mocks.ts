import type { setupServer as nativeServer } from 'msw/native';

type NativeServer = ReturnType<typeof nativeServer>;

export const MOCK_LATENCY_MS = 250;

export async function startMocks(enabled: boolean): Promise<NativeServer | null> {
  if (!enabled) return null;
  const [
    { setupServer },
    { createMockApi },
    { studentOverlayHandlers },
    { parentOverlayHandlers },
    { seedDiaryConflictDemo },
  ] = await Promise.all([
    import('msw/native'),
    import('@driveos/shared/mocks'),
    import('./mock-overlay'),
    import('./parent-overlay'),
    import('./mock-diary-seed'),
  ]);
  const mock = createMockApi({ latencyMs: MOCK_LATENCY_MS, seed: seedDiaryConflictDemo });
  const server = setupServer(
    ...parentOverlayHandlers(mock),
    ...studentOverlayHandlers(mock),
    ...mock.handlers,
  );
  server.listen({ onUnhandledRequest: 'bypass' });
  return server;
}

export async function startMocks(enabled: boolean): Promise<void> {
  if (!import.meta.env.DEV || !enabled) return;
  const [{ setupWorker }, { handlers }] = await Promise.all([
    import('msw/browser'),
    import('@driveos/shared/mocks'),
  ]);
  await setupWorker(...handlers).start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
  });
}

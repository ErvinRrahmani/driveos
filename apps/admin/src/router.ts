import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { AppServices } from './lib/services';
import { routeTree } from './routeTree.gen';

export function createAppRouter(services: AppServices, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: services,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}

import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { NotFound } from '@/components/not-found';
import type { AppServices } from '@/lib/services';

export const Route = createRootRouteWithContext<AppServices>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

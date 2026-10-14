import { useRouteContext } from '@tanstack/react-router';
import type { AppServices } from '@/lib/services';

export function useServices(): AppServices {
  return useRouteContext({ from: '__root__' });
}

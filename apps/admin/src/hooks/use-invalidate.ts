import type { paths } from '@driveos/shared/client';
import { useServices } from './use-services';

export function useInvalidate() {
  const { queryClient } = useServices();
  return (...listPaths: (keyof paths)[]) =>
    Promise.all(
      listPaths.map((path) => queryClient.invalidateQueries({ queryKey: ['get', path] })),
    );
}

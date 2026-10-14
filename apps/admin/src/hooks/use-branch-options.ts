import { useMemo } from 'react';
import { useServices } from './use-services';

export function useBranchOptions() {
  const { api } = useServices();
  const branches = api.$api.useQuery('get', '/v1/branches', { params: { query: { limit: 200 } } });
  return useMemo(() => {
    const items = branches.data?.items ?? [];
    return {
      options: items.map((branch) => ({ value: branch.id, label: branch.name })),
      nameOf: (id: string | null) => items.find((branch) => branch.id === id)?.name ?? '',
      isPending: branches.isPending,
    };
  }, [branches.data, branches.isPending]);
}

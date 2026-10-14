import { useNavigate } from '@tanstack/react-router';
import { useServices } from './use-services';

export function useSignOut() {
  const { api, auth, queryClient } = useServices();
  const navigate = useNavigate();
  return async () => {
    const { refreshToken } = auth.getState();
    if (refreshToken) {
      await api.fetchClient.POST('/v1/auth/logout', { body: { refreshToken } }).catch(() => null);
    }
    auth.clear();
    queryClient.clear();
    await navigate({ to: '/login', search: {} });
  };
}

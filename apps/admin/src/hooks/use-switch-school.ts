import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api-errors';
import { useServices } from './use-services';

export function useSwitchSchool() {
  const { api, auth, queryClient } = useServices();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const mutation = api.$api.useMutation('post', '/v1/me/switch-school');
  return {
    isPending: mutation.isPending,
    async switchTo(membershipId: string, redirect: string = '/') {
      try {
        const session = await mutation.mutateAsync({ body: { membershipId, client: 'web' } });
        auth.setSession(session);
        queryClient.removeQueries();
        await navigate({ href: redirect, replace: true });
      } catch (error) {
        toast.error(apiErrorMessage(error, t('errors.generic')));
      }
    },
  };
}

import type { ApiClient } from '@driveos/shared/client';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type ApiStatusState = 'loading' | 'ok' | 'unreachable';

const tone: Record<ApiStatusState, string> = {
  loading: 'text-muted-foreground',
  ok: 'text-emerald-700',
  unreachable: 'text-destructive',
};

export function ApiStatus({ state }: { state: ApiStatusState }) {
  const { t } = useTranslation();
  return (
    <p role="status" className={cn('text-sm font-medium', tone[state])}>
      {t(`apiStatus.${state}`)}
    </p>
  );
}

export function ApiHealth({ client }: { client: ApiClient }) {
  const health = client.$api.useQuery('get', '/v1/health');
  const state = health.isPending ? 'loading' : health.data?.status === 'ok' ? 'ok' : 'unreachable';
  return <ApiStatus state={state} />;
}

import { useTranslation } from 'react-i18next';
import { roleList } from '../components/role-label';
import type { RouteGroup } from '../lib/route-group';
import { useActiveMembership, useMe } from '../lib/session';
import { Card, EmptyState, ErrorState, LoadingState, Screen, Text } from '../ui';

type AppGroup = Exclude<RouteGroup, 'staff-only'>;

const GROUP_TITLES = {
  student: 'home.studentTitle',
  instructor: 'home.instructorTitle',
  parent: 'home.parentTitle',
} as const satisfies Record<AppGroup, string>;

export function HomeScreen({ group }: { group: AppGroup }) {
  const { t } = useTranslation();
  const me = useMe();
  const membership = useActiveMembership();

  return (
    <Screen title={t(GROUP_TITLES[group])}>
      {me.isPending && me.fetchStatus !== 'idle' ? (
        <LoadingState />
      ) : me.data ? (
        <Card accessibilityLabel={t('home.sessionCard')}>
          <Text variant="heading">{t('home.greeting', { name: me.data.user.fullName })}</Text>
          <Text>{t('home.school', { school: membership?.schoolName ?? '' })}</Text>
          <Text tone="muted">
            {t('home.roles', { roles: roleList(t, membership?.roles ?? []) })}
          </Text>
        </Card>
      ) : me.isError ? (
        <ErrorState message={me.error?.error.message} onRetry={() => void me.refetch()} />
      ) : (
        <LoadingState />
      )}
      <EmptyState title={t('home.comingSoonTitle')} description={t('home.comingSoon')} />
    </Screen>
  );
}

import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SchoolChooser } from '../components/school-chooser';
import { useSchoolSwitch } from '../components/use-school-switch';
import { useSignOut } from '../components/use-sign-out';
import { resolveDestination, selectableMemberships } from '../lib/route-group';
import { useActiveMembership, useAuthState } from '../lib/session';
import { Banner, Button, Card, LoadingState, Screen, Text } from '../ui';

export function StaffOnlyScreen() {
  const { t } = useTranslation();
  const state = useAuthState();
  const membership = useActiveMembership();
  const school = useSchoolSwitch();
  const signOut = useSignOut();
  const destination = resolveDestination(state);

  if (destination === null) return <LoadingState />;
  if (destination !== '/staff-only' && !signOut.busy && school.busyId === null) {
    return <Redirect href={destination} />;
  }

  const others = selectableMemberships(state.memberships);

  return (
    <Screen title={t('staffOnly.title')}>
      <Card>
        <Text>{t('staffOnly.body', { school: membership?.schoolName ?? '' })}</Text>
      </Card>
      {others.length > 1 ? (
        <>
          <Text variant="heading">{t('staffOnly.otherSchools')}</Text>
          {school.error ? <Banner tone="danger" message={school.error} /> : null}
          <SchoolChooser
            memberships={others}
            activeMembershipId={state.activeMembershipId}
            busyMembershipId={school.busyId}
            onChoose={(id) => {
              if (id !== state.activeMembershipId) void school.choose(id);
            }}
          />
        </>
      ) : null}
      <Button
        title={t('account.signOut')}
        variant="secondary"
        loading={signOut.busy}
        onPress={() => void signOut.signOut()}
      />
    </Screen>
  );
}

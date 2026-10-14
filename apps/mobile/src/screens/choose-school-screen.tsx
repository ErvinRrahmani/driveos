import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SchoolChooser } from '../components/school-chooser';
import { useSchoolSwitch } from '../components/use-school-switch';
import { useSignOut } from '../components/use-sign-out';
import { useAuthState } from '../lib/session';
import { Banner, Button, LoadingState, Screen } from '../ui';

export function ChooseSchoolScreen() {
  const { t } = useTranslation();
  const state = useAuthState();
  const school = useSchoolSwitch();
  const signOut = useSignOut();

  if (state.status === 'restoring') return <LoadingState />;
  if (state.status === 'signedOut' && !signOut.busy) return <Redirect href="/login" />;

  return (
    <Screen title={t('schools.chooseTitle')} subtitle={t('schools.chooseSubtitle')}>
      {school.error ? <Banner tone="danger" message={school.error} /> : null}
      <SchoolChooser
        memberships={state.memberships}
        activeMembershipId={null}
        busyMembershipId={school.busyId}
        onChoose={(id) => void school.choose(id)}
      />
      <Button
        title={t('account.signOut')}
        variant="ghost"
        loading={signOut.busy}
        onPress={() => void signOut.signOut()}
      />
    </Screen>
  );
}

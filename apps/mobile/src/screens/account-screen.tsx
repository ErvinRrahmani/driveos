import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SchoolChooser } from '../components/school-chooser';
import { useSchoolSwitch } from '../components/use-school-switch';
import { useSignOut } from '../components/use-sign-out';
import { useUnsyncedWarning } from '../lib/diary/use-diary';
import { REVIEW_HREF } from '../lib/push-target';
import { showsReviewEntry } from '../lib/review-flow';
import { routeGroupForRoles, selectableMemberships } from '../lib/route-group';
import { useActiveMembership, useAuthState, useMe } from '../lib/session';
import { Banner, Button, Card, ListItem, Screen, spacing, Text } from '../ui';

type LeaveAction = { kind: 'signOut' } | { kind: 'switch'; membershipId: string };

export function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const state = useAuthState();
  // Only the student app has the review route; an instructor who is also a student uses that app.
  const isStudent = routeGroupForRoles(useActiveMembership()?.roles ?? []) === 'student';
  const me = useMe();
  const school = useSchoolSwitch();
  const signOut = useSignOut();
  const unsynced = useUnsyncedWarning();
  const [leaving, setLeaving] = useState<LeaveAction | null>(null);
  const user = me.data?.user;
  const schools = selectableMemberships(me.data?.memberships ?? state.memberships);

  const run = (action: LeaveAction) => {
    setLeaving(null);
    if (action.kind === 'signOut') void signOut.signOut();
    else void school.choose(action.membershipId);
  };
  const request = (action: LeaveAction) => (unsynced ? setLeaving(action) : run(action));

  return (
    <Screen title={t('account.title')}>
      {user ? (
        <Card>
          <Text variant="heading">{user.fullName}</Text>
          {user.phone ? <Text tone="muted">{user.phone}</Text> : null}
          {user.email ? <Text tone="muted">{user.email}</Text> : null}
        </Card>
      ) : null}
      {isStudent && showsReviewEntry(me.data) ? (
        <ListItem
          title={t('review.title')}
          subtitle={t('review.accountHint')}
          onPress={() => router.push(REVIEW_HREF)}
        />
      ) : null}
      <Text variant="heading">{t('account.schools')}</Text>
      {school.error ? <Banner tone="danger" message={school.error} /> : null}
      <SchoolChooser
        memberships={schools}
        activeMembershipId={state.activeMembershipId}
        busyMembershipId={school.busyId}
        onChoose={(id) => {
          if (id !== state.activeMembershipId) request({ kind: 'switch', membershipId: id });
        }}
      />
      {schools.length < 2 ? (
        <Text variant="caption" tone="muted">
          {t('account.singleSchool')}
        </Text>
      ) : null}
      {leaving && unsynced ? (
        <Card style={styles.stack}>
          <Banner
            tone="warning"
            message={
              leaving.kind === 'signOut'
                ? t('account.unsyncedSignOut', { count: unsynced.count })
                : t('account.unsyncedSwitch', { count: unsynced.count })
            }
          />
          <View style={styles.stack}>
            <Button
              title={
                leaving.kind === 'signOut' ? t('account.signOutAnyway') : t('account.switchAnyway')
              }
              variant="danger"
              onPress={() => run(leaving)}
            />
            <Button
              title={t('account.keepChanges')}
              variant="secondary"
              onPress={() => setLeaving(null)}
            />
          </View>
        </Card>
      ) : null}
      <Button
        title={t('account.signOut')}
        variant="danger"
        loading={signOut.busy}
        onPress={() => request({ kind: 'signOut' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
});

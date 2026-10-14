import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import {
  LINKED_STUDENTS_KEY,
  PENDING_CONSENT_KEY,
  pendingConsents,
  usePendingConsents,
} from '../../lib/parent-context';
import { CONSENT_TEXT_VERSION, giveConsent } from '../../lib/parent-flows';
import { useServices } from '../../lib/session';
import { Banner, Button, Card, Screen, Text } from '../../ui';

export function ConsentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const services = useServices();
  const queryClient = useQueryClient();
  const { userId } = usePendingConsents();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (userId === undefined || done) return;
    void pendingConsents
      .remember(userId, linkId)
      .then(() => queryClient.invalidateQueries({ queryKey: PENDING_CONSENT_KEY }));
  }, [userId, linkId, done, queryClient]);

  const consent = async () => {
    setBusy(true);
    setProblem(null);
    const result = await giveConsent(services, linkId);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.code === 'not_found' ? t('consent.notFound') : errorMessage(t, result));
      return;
    }
    setDone(true);
    if (userId !== undefined) await pendingConsents.forget(userId, linkId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PENDING_CONSENT_KEY }),
      queryClient.invalidateQueries({ queryKey: LINKED_STUDENTS_KEY }),
    ]);
  };

  if (done) {
    return (
      <Screen>
        <Banner tone="success" message={t('consent.given')} />
        <Button title={t('consent.toHome')} onPress={() => router.replace('/parent')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="heading">{t('consent.heading')}</Text>
      <Card>
        <Text>{t('consent.body')}</Text>
        <Text tone="muted">{t('consent.version', { version: CONSENT_TEXT_VERSION })}</Text>
      </Card>
      {problem ? <Banner tone="danger" message={problem} /> : null}
      <Button title={t('consent.give')} loading={busy} onPress={() => void consent()} />
    </Screen>
  );
}

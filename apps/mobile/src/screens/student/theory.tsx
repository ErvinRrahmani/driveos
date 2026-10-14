import { FREE_MOCK_EXAMS_PER_WEEK, type TheorySessionMode } from '@driveos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { useServices } from '../../lib/session';
import { useSchoolSettings, useTheoryStats } from '../../lib/student-data';
import { SHOP_HREF } from '../../lib/student-flows';
import { theoryAccess } from '../../lib/theory-access';
import { startTheorySession } from '../../lib/theory-flow';
import { Banner, Button, Card, Screen, Text } from '../../ui';
import { Loadable, Section } from './common';

export const theorySessionKey = (id: string) => ['theorySession', id] as const;

export function TheoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const services = useServices();
  const queryClient = useQueryClient();
  const stats = useTheoryStats();
  const settings = useSchoolSettings();
  const [starting, setStarting] = useState<TheorySessionMode | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const start = async (mode: TheorySessionMode) => {
    setStarting(mode);
    setFailure(null);
    const result = await startTheorySession(services, mode);
    setStarting(null);
    if (!result.ok) {
      setFailure(errorMessage(t, result));
      return;
    }
    queryClient.setQueryData(theorySessionKey(result.session.id), result.session);
    await queryClient.invalidateQueries({ queryKey: ['get', '/v1/theory/stats'] });
    router.push(`/student/theory/session/${result.session.id}`);
  };

  return (
    <Screen title={t('theory.title')}>
      <Loadable query={stats}>
        {(data) => {
          const access = theoryAccess(data, settings.data);
          return (
            <>
              <Card accessibilityLabel={t('theory.statsTitle')}>
                <Text variant="label" tone="muted">
                  {t('theory.statsTitle')}
                </Text>
                <Text>
                  {t('theory.answered', {
                    answered: data.answered,
                    questions: data.questions,
                    correct: data.correct,
                  })}
                </Text>
                <Text>
                  {t('theory.mocks', {
                    passed: data.mockExamsPassed,
                    taken: data.mockExamsTaken,
                  })}
                </Text>
                {data.lastMockScore !== null && data.lastMockMaxScore !== null ? (
                  <Text>
                    {t('theory.lastMock', {
                      score: data.lastMockScore,
                      max: data.lastMockMaxScore,
                    })}
                  </Text>
                ) : null}
                <Text>{t('theory.openMistakes', { count: data.openMistakes })}</Text>
                <Text variant="label" tone={access.premium ? 'primary' : 'muted'}>
                  {access.premium ? t('theory.premium') : t('theory.free')}
                </Text>
              </Card>
              {failure ? <Banner tone="danger" message={failure} /> : null}
              <Section title={t('theory.practiceTitle')}>
                <Text tone="muted">{t('theory.practiceBody')}</Text>
                <Button
                  title={t('theory.startPractice')}
                  loading={starting === 'practice'}
                  disabled={starting !== null}
                  onPress={() => void start('practice')}
                />
              </Section>
              <Section title={t('theory.mockTitle')}>
                <Text tone="muted">
                  {access.mocksLeft === null
                    ? t('theory.mockUnlimited')
                    : t('theory.mocksLeft', {
                        count: access.mocksLeft,
                        total: FREE_MOCK_EXAMS_PER_WEEK,
                      })}
                </Text>
                <Button
                  title={t('theory.startMock')}
                  loading={starting === 'mock'}
                  disabled={starting !== null || !access.canMock}
                  onPress={() => void start('mock')}
                />
              </Section>
              <Section title={t('theory.mistakesTitle')}>
                <Text tone="muted">
                  {access.canMistakes ? t('theory.mistakesBody') : t('theory.mistakesLocked')}
                </Text>
                <Button
                  title={t('theory.startMistakes')}
                  variant="secondary"
                  loading={starting === 'mistakes'}
                  disabled={starting !== null || !access.canMistakes || data.openMistakes === 0}
                  onPress={() => void start('mistakes')}
                />
              </Section>
              {access.premium ? null : (
                <Card>
                  <Text variant="label">{t('theory.premiumTitle')}</Text>
                  <Text tone="muted">{t('theory.premiumBody')}</Text>
                  <Button
                    title={t('theory.getPremium')}
                    variant="secondary"
                    onPress={() => router.push(SHOP_HREF)}
                  />
                </Card>
              )}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

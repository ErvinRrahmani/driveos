import { PROGRESS_LEVEL_MAX } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/format';
import { useDisplayZone, useProgress, useStudentId } from '../../lib/student-data';
import { Card, ListItem, Screen, Text } from '../../ui';
import { Loadable, Section } from './common';

export function ProgressScreen() {
  const { t } = useTranslation();
  const progress = useProgress(useStudentId());
  const zone = useDisplayZone();

  return (
    <Screen>
      <Loadable query={progress}>
        {(data) => (
          <>
            <Card accessibilityLabel={t('progress.title')}>
              <Text variant="label" tone="muted">
                {t('progress.overall')}
              </Text>
              <Text variant="title">{t('progress.percent', { value: data.progressPct })}</Text>
            </Card>
            <Section title={t('progress.syllabus')}>
              {data.syllabus.map((item) => (
                <ListItem
                  key={item.syllabusItemId}
                  title={`${item.code} · ${item.title}`}
                  subtitle={[
                    item.level === null
                      ? t('progress.notStarted')
                      : t('progress.level', { level: item.level, max: PROGRESS_LEVEL_MAX }),
                    item.lastNote ?? '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </Section>
            <Section title={t('progress.tests')}>
              {data.testAttempts.length === 0 ? (
                <Text tone="muted">{t('progress.noTests')}</Text>
              ) : (
                data.testAttempts.map((attempt) => (
                  <ListItem
                    key={attempt.id}
                    title={`${attempt.kind === 'theory' ? t('progress.theoryTest') : t('progress.practicalTest')} · ${
                      attempt.result === 'passed' ? t('progress.passed') : t('progress.failed')
                    }`}
                    subtitle={formatDate(`${attempt.takenOn}T12:00:00.000Z`, zone)}
                  />
                ))
              )}
            </Section>
          </>
        )}
      </Loadable>
    </Screen>
  );
}

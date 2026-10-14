import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { canCancel, isLateCancel } from '../../lib/cancellation';
import { formatDateTime, formatDuration, formatTime } from '../../lib/format';
import { useServices } from '../../lib/session';
import {
  LESSON_QUERIES,
  useDisplayZone,
  useInvalidate,
  useSchoolSettings,
  useStudentId,
  useStudentLessons,
} from '../../lib/student-data';
import { cancelLesson } from '../../lib/student-flows';
import { Banner, Button, Card, EmptyState, Screen, Text } from '../../ui';
import { Loadable, useNow } from './common';
import { lessonStatusLabel } from './labels';

type CancelState =
  | { step: 'idle' }
  | { step: 'confirm' }
  | { step: 'busy' }
  | { step: 'done'; late: boolean; minutesRestored: number }
  | { step: 'failed'; message: string };

export function LessonScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useServices();
  const invalidate = useInvalidate();
  const lessons = useStudentLessons(useStudentId());
  const settings = useSchoolSettings();
  const zone = useDisplayZone();
  const now = useNow();
  const [cancel, setCancel] = useState<CancelState>({ step: 'idle' });

  return (
    <Screen>
      <Loadable query={lessons}>
        {(data) => {
          const lesson = data.items.find((item) => item.id === id);
          if (!lesson) return <EmptyState title={t('lesson.notFound')} />;
          const windowHours = settings.data?.cancellationWindowHours;
          const late = windowHours !== undefined && isLateCancel(lesson.start, now, windowHours);
          const cancellable = canCancel(lesson, now) && cancel.step !== 'done';
          const confirm = async () => {
            setCancel({ step: 'busy' });
            const result = await cancelLesson(services, lesson);
            if (!result.ok) {
              setCancel({ step: 'failed', message: errorMessage(t, result) });
              return;
            }
            setCancel({ step: 'done', late: result.late, minutesRestored: result.minutesRestored });
            await invalidate(LESSON_QUERIES);
          };
          return (
            <>
              <Card>
                <Text variant="heading">{lesson.lessonTypeName}</Text>
                <Text>
                  {formatDateTime(lesson.start, zone)} – {formatTime(lesson.end, zone)}
                </Text>
                <Text>{t('lesson.instructor', { name: lesson.instructorName })}</Text>
                {lesson.vehiclePlate ? (
                  <Text>{t('lesson.vehicle', { plate: lesson.vehiclePlate })}</Text>
                ) : null}
                <Text>{t('lesson.pickup', { address: lesson.pickupAddress })}</Text>
                <Text tone="muted">
                  {t('lesson.credit', { credit: formatDuration(t, lesson.creditMinutes) })}
                </Text>
                <Text variant="label">
                  {lessonStatusLabel(t, lesson.status, lesson.lateCancel)}
                </Text>
              </Card>
              {cancel.step === 'done' ? (
                <Banner
                  tone={cancel.late ? 'warning' : 'success'}
                  message={
                    cancel.late
                      ? t('lesson.cancelledLate')
                      : t('lesson.cancelledRestored', {
                          credit: formatDuration(t, cancel.minutesRestored),
                        })
                  }
                />
              ) : null}
              {cancel.step === 'failed' ? <Banner tone="danger" message={cancel.message} /> : null}
              {cancellable ? (
                <>
                  {windowHours === undefined ? (
                    settings.isError ? (
                      <Banner tone="warning" message={t('lesson.windowUnknown')} />
                    ) : null
                  ) : late ? (
                    <Banner
                      tone="warning"
                      message={t('lesson.lateWarning', {
                        hours: windowHours,
                        credit: formatDuration(t, lesson.creditMinutes),
                      })}
                    />
                  ) : (
                    <Banner
                      tone="info"
                      message={t('lesson.freeCancel', {
                        hours: windowHours,
                        deadline: formatDateTime(
                          new Date(
                            Date.parse(lesson.start) - windowHours * 3_600_000,
                          ).toISOString(),
                          zone,
                        ),
                      })}
                    />
                  )}
                  {cancel.step === 'confirm' || cancel.step === 'busy' ? (
                    <>
                      <Button
                        title={late ? t('lesson.confirmLateCancel') : t('lesson.confirmCancel')}
                        variant="danger"
                        loading={cancel.step === 'busy'}
                        onPress={() => void confirm()}
                      />
                      <Button
                        title={t('lesson.keep')}
                        variant="ghost"
                        disabled={cancel.step === 'busy'}
                        onPress={() => setCancel({ step: 'idle' })}
                      />
                    </>
                  ) : (
                    <Button
                      title={t('lesson.cancel')}
                      variant="danger"
                      disabled={windowHours === undefined && !settings.isError}
                      onPress={() => setCancel({ step: 'confirm' })}
                    />
                  )}
                </>
              ) : null}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

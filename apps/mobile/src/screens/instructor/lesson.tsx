import type { LessonResponse } from '@driveos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useDiary, useDiaryData } from '../../lib/diary/use-diary';
import { diaryLesson } from '../../lib/diary/view';
import { formatDate, formatTime } from '../../lib/format';
import { useDisplayZone } from '../../lib/student-data';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  spacing,
  Text,
} from '../../ui';
import { lessonStatusText, OpenInMapsButton, SyncBadgeView, SyncStatusLine } from './common';

export function LessonFields({ lesson, zone }: { lesson: LessonResponse; zone: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <Text variant="heading">{t('diary.lesson.student', { name: lesson.studentName })}</Text>
      <Text>
        {t('diary.lesson.time', {
          date: formatDate(lesson.start, zone),
          start: formatTime(lesson.start, zone),
          end: formatTime(lesson.end, zone),
        })}
      </Text>
      <Text>{t('diary.lesson.type', { type: lesson.lessonTypeName })}</Text>
      <Text>
        {lesson.vehiclePlate
          ? t('diary.lesson.vehicle', { plate: lesson.vehiclePlate })
          : t('diary.lesson.noVehicle')}
      </Text>
      {lesson.pickupAddress ? (
        <Text>{t('diary.lesson.pickup', { address: lesson.pickupAddress })}</Text>
      ) : null}
      <Text>{t('diary.lesson.status', { status: lessonStatusText(t, lesson) })}</Text>
      {lesson.cancelReason ? (
        <Text tone="muted">{t('diary.lesson.cancelReason', { reason: lesson.cancelReason })}</Text>
      ) : null}
    </Card>
  );
}

type NoShowState = 'idle' | 'confirm' | 'busy' | 'failed';

function LessonActions({ lesson }: { lesson: LessonResponse }) {
  const { t } = useTranslation();
  const router = useRouter();
  const diary = useDiary();
  const [noShow, setNoShow] = useState<NoShowState>('idle');
  const booked = lesson.status === 'booked';
  const markNoShow = async () => {
    setNoShow('busy');
    try {
      await diary.enqueue({ type: 'lesson.no_show', payload: { lessonId: lesson.id } });
      setNoShow('idle');
    } catch {
      setNoShow('failed');
    }
  };
  return (
    <View style={styles.actions}>
      {booked ? (
        <Button
          title={t('diary.actions.complete')}
          onPress={() =>
            router.push({ pathname: '/instructor/complete/[id]', params: { id: lesson.id } })
          }
        />
      ) : null}
      {booked && (noShow === 'confirm' || noShow === 'busy') ? (
        <Card style={styles.confirm}>
          <Text>{t('diary.actions.noShowQuestion', { name: lesson.studentName })}</Text>
          <Button
            title={t('diary.actions.noShowConfirm')}
            variant="danger"
            loading={noShow === 'busy'}
            onPress={() => void markNoShow()}
          />
          <Button
            title={t('diary.actions.noShowKeep')}
            variant="ghost"
            disabled={noShow === 'busy'}
            onPress={() => setNoShow('idle')}
          />
        </Card>
      ) : booked ? (
        <Button
          title={t('diary.actions.noShow')}
          variant="secondary"
          onPress={() => setNoShow('confirm')}
        />
      ) : null}
      {noShow === 'failed' ? <Banner tone="danger" message={t('diary.actions.failed')} /> : null}
      <Button
        title={t('diary.actions.recordCash')}
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/instructor/cash',
            params: { studentId: lesson.studentId, lessonId: lesson.id },
          })
        }
      />
      <OpenInMapsButton
        target={{ lat: lesson.pickupLat, lng: lesson.pickupLng, address: lesson.pickupAddress }}
      />
    </View>
  );
}

export function DiaryLessonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const zone = useDisplayZone();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = useDiaryData(`lesson|${id}`, (reader) => diaryLesson(reader, id));
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/instructor'));

  return (
    <Screen title={t('diary.lesson.title')}>
      <Button title={t('diary.lesson.back')} variant="ghost" onPress={back} />
      <SyncStatusLine />
      {lesson.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : lesson.data === undefined ? (
        <LoadingState />
      ) : lesson.data === null ? (
        <EmptyState title={t('diary.lesson.notFound')} />
      ) : (
        <>
          <SyncBadgeView sync={lesson.data.sync} />
          <LessonFields lesson={lesson.data.lesson} zone={zone} />
          <LessonActions lesson={lesson.data.lesson} />
          {lesson.data.sync === 'conflict' ? (
            <Button
              title={t('diary.lesson.openConflicts')}
              onPress={() => router.navigate('/instructor/conflicts')}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  confirm: { gap: spacing.sm },
});

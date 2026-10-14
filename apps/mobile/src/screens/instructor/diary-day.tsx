import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { dayRange, addDays, todayIn } from '../../lib/diary/days';
import { useDiaryData } from '../../lib/diary/use-diary';
import { type DiaryLesson, diaryLessons } from '../../lib/diary/view';
import { formatDay, formatTime } from '../../lib/format';
import { useDisplayZone } from '../../lib/student-data';
import { Button, EmptyState, ErrorState, ListItem, LoadingState, Screen, spacing } from '../../ui';
import { lessonStatusText, SyncBadgeView, SyncStatusLine } from './common';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_PATTERN.test(value);
}

function LessonRow({ item, zone }: { item: DiaryLesson; zone: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { lesson } = item;
  return (
    <ListItem
      title={`${t('diary.lessonTime', {
        start: formatTime(lesson.start, zone),
        end: formatTime(lesson.end, zone),
      })} · ${lesson.studentName}`}
      subtitle={[lesson.lessonTypeName, lesson.pickupAddress, lessonStatusText(t, lesson)]
        .filter(Boolean)
        .join(' · ')}
      accessory={<SyncBadgeView sync={item.sync} />}
      onPress={() =>
        router.push({ pathname: '/instructor/lesson/[id]', params: { id: lesson.id } })
      }
    />
  );
}

export function DiaryDayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const zone = useDisplayZone();
  const params = useLocalSearchParams<{ day?: string }>();
  const today = todayIn(new Date(), zone);
  const day = isDay(params.day) ? params.day : today;
  const range = dayRange(day, zone);
  const lessons = useDiaryData(`day|${day}|${zone}`, (reader) => diaryLessons(reader, range));
  const go = (next: string) => router.setParams({ day: next });

  return (
    <Screen title={t('diary.title')} subtitle={formatDay(day)}>
      <SyncStatusLine />
      <View style={styles.row}>
        <Button
          title={t('diary.previousDay')}
          variant="secondary"
          onPress={() => go(addDays(day, -1))}
        />
        <Button
          title={t('diary.today')}
          variant="ghost"
          disabled={day === today}
          onPress={() => go(today)}
        />
        <Button
          title={t('diary.nextDay')}
          variant="secondary"
          onPress={() => go(addDays(day, 1))}
        />
      </View>
      {lessons.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : lessons.data === undefined ? (
        <LoadingState />
      ) : lessons.data.length === 0 ? (
        <EmptyState title={t('diary.empty')} />
      ) : (
        lessons.data.map((item) => <LessonRow key={item.lesson.id} item={item} zone={zone} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

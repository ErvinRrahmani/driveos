import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { addDays, dayRange, todayIn, weekOf } from '../../lib/diary/days';
import { useDiaryData } from '../../lib/diary/use-diary';
import { type DiaryLesson, diaryLessons } from '../../lib/diary/view';
import { dayKey, formatDay } from '../../lib/format';
import { useDisplayZone } from '../../lib/student-data';
import { Button, ErrorState, ListItem, LoadingState, Screen, spacing } from '../../ui';
import type { SyncBadge } from '../../lib/diary/types';
import { lessonStatusText, SyncBadgeView, SyncStatusLine } from './common';
import { isDay } from './diary-day';

function worstBadge(items: readonly DiaryLesson[]): SyncBadge {
  if (items.some((item) => item.sync === 'conflict')) return 'conflict';
  return items.some((item) => item.sync === 'pending') ? 'pending' : 'synced';
}

export function DiaryWeekScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const zone = useDisplayZone();
  const params = useLocalSearchParams<{ week?: string }>();
  const today = todayIn(new Date(), zone);
  const days = weekOf(isDay(params.week) ? params.week : today);
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  const range = { from: dayRange(first, zone).from, to: dayRange(last, zone).to };
  const lessons = useDiaryData(`week|${first}|${zone}`, (reader) => diaryLessons(reader, range));
  const go = (anchor: string) => router.setParams({ week: anchor });

  const byDay = new Map<string, DiaryLesson[]>();
  for (const item of lessons.data ?? []) {
    const key = dayKey(item.lesson.start, zone);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  return (
    <Screen
      title={t('diary.weekTitle')}
      subtitle={t('diary.weekRange', { from: formatDay(first), to: formatDay(last) })}
    >
      <SyncStatusLine />
      <View style={styles.row}>
        <Button
          title={t('diary.previousWeek')}
          variant="secondary"
          onPress={() => go(addDays(first, -7))}
        />
        <Button
          title={t('diary.thisWeek')}
          variant="ghost"
          disabled={days.includes(today)}
          onPress={() => go(today)}
        />
        <Button
          title={t('diary.nextWeek')}
          variant="secondary"
          onPress={() => go(addDays(first, 7))}
        />
      </View>
      {lessons.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : lessons.data === undefined ? (
        <LoadingState />
      ) : (
        days.map((day) => {
          const items = byDay.get(day) ?? [];
          const statuses = [...new Set(items.map((item) => lessonStatusText(t, item.lesson)))];
          return (
            <ListItem
              key={day}
              title={formatDay(day)}
              selected={day === today}
              subtitle={
                items.length === 0
                  ? t('diary.noLessons')
                  : [t('diary.lessonCount', { count: items.length }), ...statuses].join(' · ')
              }
              accessory={<SyncBadgeView sync={worstBadge(items)} />}
              onPress={() => router.navigate({ pathname: '/instructor', params: { day } })}
            />
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

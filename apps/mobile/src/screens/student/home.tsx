import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDuration, splitLessons } from '../../lib/format';
import { useActiveMembership, useMe } from '../../lib/session';
import {
  useDisplayZone,
  useOpenSlotOffers,
  useShop,
  useStudentLessons,
  useTheoryStats,
} from '../../lib/student-data';
import { Card, ListItem, Screen, Text } from '../../ui';
import { Section, useNow } from './common';

export function StudentHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const membership = useActiveMembership();
  const shop = useShop();
  const lessons = useStudentLessons(shop.data?.studentId);
  const offers = useOpenSlotOffers();
  const stats = useTheoryStats();
  const zone = useDisplayZone();
  const now = useNow();
  const next = splitLessons(lessons.data?.items ?? [], now).upcoming[0];
  const openOffers = offers.data?.items.length ?? 0;

  return (
    <Screen
      title={
        me.data
          ? t('studentHome.greeting', { name: me.data.user.fullName })
          : t('home.studentTitle')
      }
      subtitle={membership?.schoolName}
    >
      <Card accessibilityLabel={t('studentHome.nextLesson')}>
        <Text variant="label" tone="muted">
          {t('studentHome.nextLesson')}
        </Text>
        {next ? (
          <>
            <Text variant="heading">{formatDateTime(next.start, zone)}</Text>
            <Text>
              {t('studentHome.lessonWith', {
                type: next.lessonTypeName,
                instructor: next.instructorName,
              })}
            </Text>
          </>
        ) : (
          <Text>{lessons.isPending ? t('common.loading') : t('studentHome.noLesson')}</Text>
        )}
      </Card>
      <Section title={t('studentHome.overview')}>
        <ListItem
          title={t('studentHome.balance')}
          subtitle={
            shop.data
              ? formatDuration(t, shop.data.balanceMinutes)
              : shop.isError
                ? t('errors.generic')
                : t('common.loading')
          }
          onPress={() => router.push('/student/balance')}
        />
        <ListItem
          title={t('studentHome.offers')}
          subtitle={t('studentHome.offersCount', { count: openOffers })}
          onPress={() => router.push('/student/offers')}
        />
        <ListItem
          title={t('studentHome.theory')}
          subtitle={
            stats.data
              ? t('studentHome.theorySummary', {
                  correct: stats.data.correct,
                  answered: stats.data.answered,
                  mistakes: stats.data.openMistakes,
                })
              : t('common.loading')
          }
          onPress={() => router.push('/student/theory')}
        />
        <ListItem
          title={t('studentHome.progress')}
          onPress={() => router.push('/student/progress')}
        />
        <ListItem
          title={t('studentHome.documents')}
          onPress={() => router.push('/student/documents')}
        />
      </Section>
      {next ? (
        <ListItem
          title={t('studentHome.openNextLesson')}
          onPress={() => router.push(`/student/lessons/${next.id}`)}
        />
      ) : (
        <ListItem title={t('lessons.book')} onPress={() => router.push('/student/lessons/book')} />
      )}
    </Screen>
  );
}

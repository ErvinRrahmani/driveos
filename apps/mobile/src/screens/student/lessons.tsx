import type { ReactNode } from 'react';
import type { LessonResponse } from '@driveos/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStudentScope } from '../../lib/student-scope';
import { formatDateTime, splitLessons } from '../../lib/format';
import { useDisplayZone, useStudentId, useStudentLessons } from '../../lib/student-data';
import { Button, EmptyState, ListItem, Screen, Text } from '../../ui';
import { lessonStatusLabel } from './labels';
import { Loadable, Section, useNow } from './common';

function LessonList({ lessons, empty }: { lessons: LessonResponse[]; empty: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { links } = useStudentScope();
  const zone = useDisplayZone();
  if (lessons.length === 0) return <Text tone="muted">{empty}</Text>;
  return (
    <>
      {lessons.map((lesson) => (
        <ListItem
          key={lesson.id}
          title={formatDateTime(lesson.start, zone)}
          subtitle={`${lesson.lessonTypeName} · ${lesson.instructorName} · ${lessonStatusLabel(
            t,
            lesson.status,
            lesson.lateCancel,
          )}`}
          onPress={() => router.push(links.lesson(lesson.id))}
        />
      ))}
    </>
  );
}

export function LessonsScreen({ header }: { header?: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const studentId = useStudentId();
  const { links } = useStudentScope();
  const lessons = useStudentLessons(studentId);
  const now = useNow();

  return (
    <Screen title={t('lessons.title')}>
      {header}
      <Button
        title={t('lessons.book')}
        disabled={studentId === undefined}
        onPress={() => router.push(links.book)}
      />
      <Loadable query={lessons}>
        {(data) => {
          const { upcoming, past } = splitLessons(data.items, now);
          if (data.items.length === 0) {
            return <EmptyState title={t('lessons.emptyTitle')} description={t('lessons.empty')} />;
          }
          return (
            <>
              <Section title={t('lessons.upcoming')}>
                <LessonList lessons={upcoming} empty={t('lessons.noUpcoming')} />
              </Section>
              <Section title={t('lessons.past')}>
                <LessonList lessons={past} empty={t('lessons.noPast')} />
              </Section>
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

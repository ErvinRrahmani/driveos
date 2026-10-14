import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDuration, splitLessons } from '../../lib/format';
import { useParentStudents, usePendingConsents } from '../../lib/parent-context';
import { useMe } from '../../lib/session';
import { useBalance, useDisplayZone, useProgress, useStudentLessons } from '../../lib/student-data';
import { Banner, Button, Card, ListItem, Screen } from '../../ui';
import { Loadable, useNow } from '../student/common';
import { NoLinkedStudent, StudentSwitcher } from './switcher';

function PendingConsents() {
  const { t } = useTranslation();
  const router = useRouter();
  const { links } = usePendingConsents();
  return links.map((linkId) => (
    <Card key={linkId}>
      <Banner tone="warning" message={t('parent.consentPending')} />
      <Button
        title={t('parent.giveConsent')}
        onPress={() => router.push(`/parent/consent/${linkId}`)}
      />
    </Card>
  ));
}

function StudentSummary({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const zone = useDisplayZone();
  const now = useNow();
  const lessons = useStudentLessons(studentId);
  const balance = useBalance(studentId);
  const progress = useProgress(studentId);
  const next = lessons.data ? splitLessons(lessons.data.items, now).upcoming[0] : undefined;

  return (
    <>
      <ListItem
        title={t('parent.nextLesson')}
        subtitle={
          next
            ? `${formatDateTime(next.start, zone)} · ${next.lessonTypeName} · ${next.instructorName}`
            : t('lessons.noUpcoming')
        }
        onPress={() => router.push(next ? `/parent/lessons/${next.id}` : '/parent/lessons')}
      />
      <ListItem
        title={t('parent.credit')}
        subtitle={balance.data ? formatDuration(t, balance.data.balanceMinutes) : undefined}
        onPress={() => router.push('/parent/money')}
      />
      <ListItem
        title={t('progress.title')}
        subtitle={
          progress.data ? t('parent.progressPct', { pct: progress.data.progressPct }) : undefined
        }
        onPress={() => router.push('/parent/progress')}
      />
      <ListItem title={t('documents.title')} onPress={() => router.push('/parent/documents')} />
      <ListItem title={t('lessons.book')} onPress={() => router.push('/parent/lessons/book')} />
    </>
  );
}

export function ParentHomeScreen() {
  const { t } = useTranslation();
  const me = useMe();
  const { query, selected } = useParentStudents();
  const pending = usePendingConsents().links;

  return (
    <Screen
      title={t('home.parentTitle')}
      subtitle={me.data ? t('home.greeting', { name: me.data.user.fullName }) : undefined}
    >
      <PendingConsents />
      <Loadable query={query}>
        {() =>
          selected ? (
            <>
              <StudentSwitcher />
              <StudentSummary studentId={selected.id} />
            </>
          ) : pending.length === 0 ? (
            <NoLinkedStudent />
          ) : null
        }
      </Loadable>
    </Screen>
  );
}

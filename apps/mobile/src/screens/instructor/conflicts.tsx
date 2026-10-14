import type { LessonResponse } from '@driveos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { targetLessonId } from '../../lib/diary/reducer';
import type { DiaryReader } from '../../lib/diary/store';
import type { QueuedOp } from '../../lib/diary/types';
import { useDiary, useDiaryData } from '../../lib/diary/use-diary';
import { diaryConflicts, diaryLesson } from '../../lib/diary/view';
import { formatDateTime } from '../../lib/format';
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
import { lessonStatusText, opLabel, SyncStatusLine } from './common';

interface ConflictView {
  item: QueuedOp;
  local: LessonResponse | null;
}

async function readConflicts(reader: DiaryReader): Promise<ConflictView[]> {
  const conflicts = await diaryConflicts(reader);
  return Promise.all(
    conflicts.map(async (item) => {
      const lessonId = targetLessonId(item.op);
      const local = lessonId ? ((await diaryLesson(reader, lessonId))?.lesson ?? null) : null;
      return { item, local: local ?? item.draft };
    }),
  );
}

function LessonLine({ lesson, zone }: { lesson: LessonResponse; zone: string }) {
  const { t } = useTranslation();
  return (
    <Text tone="muted">
      {[formatDateTime(lesson.start, zone), lesson.studentName, lessonStatusText(t, lesson)].join(
        ' · ',
      )}
    </Text>
  );
}

function ConflictCard({ view, zone }: { view: ConflictView; zone: string }) {
  const { t } = useTranslation();
  const diary = useDiary();
  const [busy, setBusy] = useState<'keep' | 'retry' | null>(null);
  const [failed, setFailed] = useState(false);
  const { item, local } = view;
  const run = async (kind: 'keep' | 'retry') => {
    setBusy(kind);
    setFailed(false);
    try {
      if (kind === 'keep') await diary.keepServer(item.op.opId);
      else await diary.retry(item.op.opId);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  return (
    <Card style={styles.card}>
      <View style={styles.block}>
        <Text variant="label">{t('diary.conflicts.yourChange')}</Text>
        <Text>{opLabel(t, item.op, zone)}</Text>
        {local ? <LessonLine lesson={local} zone={zone} /> : null}
      </View>
      <View style={styles.block}>
        <Text variant="label">{t('diary.conflicts.serverState')}</Text>
        {item.serverState ? (
          <LessonLine lesson={item.serverState} zone={zone} />
        ) : (
          <Text tone="muted">{t('diary.conflicts.noServerState')}</Text>
        )}
      </View>
      {item.error ? (
        <Text tone="danger">{t('diary.conflicts.reason', { message: item.error.message })}</Text>
      ) : null}
      {failed ? <Banner tone="danger" message={t('diary.conflicts.failed')} /> : null}
      <View style={styles.actions}>
        <Button
          title={t('diary.conflicts.keepServer')}
          variant="secondary"
          loading={busy === 'keep'}
          disabled={busy !== null}
          onPress={() => void run('keep')}
        />
        <Button
          title={t('diary.conflicts.retry')}
          loading={busy === 'retry'}
          disabled={busy !== null}
          onPress={() => void run('retry')}
        />
      </View>
    </Card>
  );
}

export function DiaryConflictsScreen() {
  const { t } = useTranslation();
  const zone = useDisplayZone();
  const conflicts = useDiaryData('conflicts', readConflicts);

  return (
    <Screen title={t('diary.conflicts.title')}>
      <SyncStatusLine />
      {conflicts.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : conflicts.data === undefined ? (
        <LoadingState />
      ) : conflicts.data.length === 0 ? (
        <EmptyState title={t('diary.conflicts.empty')} />
      ) : (
        <>
          <Text tone="muted">{t('diary.conflicts.intro')}</Text>
          {conflicts.data.map((view) => (
            <ConflictCard key={view.item.op.opId} view={view} zone={zone} />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  block: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

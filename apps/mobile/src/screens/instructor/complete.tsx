import {
  PROGRESS_LEVEL_MAX,
  PROGRESS_LEVEL_MIN,
  type ProgressLevel,
  type SyllabusItem,
} from '@driveos/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Chips } from '../../components/chips';
import {
  completeLesson,
  type ProgressDraft,
  readStartingProgress,
  type StartingPoint,
} from '../../lib/diary/complete';
import type { DiaryReader } from '../../lib/diary/store';
import { useDiary, useDiaryData } from '../../lib/diary/use-diary';
import { diaryLesson } from '../../lib/diary/view';
import { useOnline } from '../../lib/network';
import { PERSIST } from '../../lib/query';
import { useServices } from '../../lib/session';
import { useDisplayZone } from '../../lib/student-data';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Screen,
  spacing,
  Text,
} from '../../ui';
import { Loadable } from '../student/common';
import { LessonFields } from './lesson';
import { SyncStatusLine } from './common';

const PROGRESS_NOTE_MAX = 2000;
const PRIVATE_NOTE_MAX = 5000;
const LEVELS = Array.from(
  { length: PROGRESS_LEVEL_MAX - PROGRESS_LEVEL_MIN + 1 },
  (_, index) => PROGRESS_LEVEL_MIN + index,
);

function useSyllabus(licenceClass: string | undefined) {
  const { api } = useServices();
  return api.$api.useQuery(
    'get',
    '/v1/syllabus',
    { params: { query: licenceClass ? { licenceClass } : {} } },
    { meta: PERSIST },
  );
}

async function readCompletion(reader: DiaryReader, lessonId: string) {
  const lesson = await diaryLesson(reader, lessonId);
  if (!lesson) return null;
  const student = await reader.get('student', lesson.lesson.studentId);
  return {
    lesson: lesson.lesson,
    licenceClass: student?.licenceClass,
    start: (await readStartingProgress(reader, lessonId)) ?? new Map<string, StartingPoint>(),
  };
}

type Drafts = Record<string, { level: ProgressLevel; note: string }>;

function SyllabusRow({
  item,
  start,
  draft,
  onChange,
}: {
  item: SyllabusItem;
  start: StartingPoint | undefined;
  draft: Drafts[string] | undefined;
  onChange: (next: Drafts[string]) => void;
}) {
  const { t } = useTranslation();
  const level = draft?.level ?? start?.level ?? null;
  const note = draft?.note ?? start?.note ?? '';
  return (
    <Card style={styles.row}>
      <Text variant="label">
        {t('diary.complete.item', { code: item.code, title: item.title })}
      </Text>
      <Text variant="caption" tone="muted">
        {start
          ? t('diary.complete.lastLevel', { level: start.level, max: PROGRESS_LEVEL_MAX })
          : t('diary.complete.notStarted')}
      </Text>
      <Chips
        chips={LEVELS.map((value) => ({
          key: String(value),
          label: t('diary.complete.level', { level: value }),
        }))}
        selected={level === null ? null : String(level)}
        onSelect={(key) => onChange({ level: Number(key), note })}
      />
      {draft ? (
        <Input
          label={t('diary.complete.note')}
          value={note}
          maxLength={PROGRESS_NOTE_MAX}
          multiline
          onChangeText={(text) => onChange({ level: draft.level, note: text })}
        />
      ) : null}
    </Card>
  );
}

export function CompleteLessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompleteLesson key={id} id={id} />;
}

function CompleteLesson({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const zone = useDisplayZone();
  const diary = useDiary();
  const data = useDiaryData(`complete|${id}`, (reader) => readCompletion(reader, id));
  const syllabus = useSyllabus(data.data?.licenceClass);
  const online = useOnline();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [privateNote, setPrivateNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.navigate({ pathname: '/instructor/lesson/[id]', params: { id } });

  const save = async () => {
    setSaving(true);
    setFailure(null);
    const progress: ProgressDraft[] = Object.entries(drafts).map(([syllabusItemId, draft]) => ({
      syllabusItemId,
      level: draft.level,
      note: draft.note,
    }));
    try {
      await completeLesson(diary, { lessonId: id, progress, privateNote });
      setDrafts({});
      setPrivateNote('');
      back();
    } catch (error) {
      setFailure(
        error instanceof Error && error.message === 'lesson_not_booked'
          ? t('diary.complete.notBooked')
          : t('diary.actions.failed'),
      );
    }
    setSaving(false);
  };

  return (
    <Screen title={t('diary.complete.title')}>
      <Button title={t('diary.complete.back')} variant="ghost" onPress={back} />
      <SyncStatusLine />
      {data.failed ? (
        <ErrorState message={t('diary.loadFailed')} />
      ) : data.data === undefined ? (
        <LoadingState />
      ) : data.data === null ? (
        <EmptyState title={t('diary.lesson.notFound')} />
      ) : data.data.lesson.status !== 'booked' && !saving ? (
        <>
          <LessonFields lesson={data.data.lesson} zone={zone} />
          <EmptyState title={t('diary.complete.notBooked')} />
        </>
      ) : (
        <>
          <LessonFields lesson={data.data.lesson} zone={zone} />
          <Text variant="heading">{t('diary.complete.syllabus')}</Text>
          <Text tone="muted">{t('diary.complete.intro')}</Text>
          {!online && syllabus.data === undefined ? (
            <Banner tone="info" message={t('diary.complete.syllabusOffline')} />
          ) : null}
          <Loadable query={syllabus}>
            {({ items }) =>
              items.length === 0 ? (
                <Text tone="muted">{t('diary.complete.noSyllabus')}</Text>
              ) : (
                <View style={styles.list}>
                  {[...items]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => (
                      <SyllabusRow
                        key={item.id}
                        item={item}
                        start={data.data?.start.get(item.id)}
                        draft={drafts[item.id]}
                        onChange={(next) => setDrafts((all) => ({ ...all, [item.id]: next }))}
                      />
                    ))}
                </View>
              )
            }
          </Loadable>
          <Input
            label={t('diary.complete.privateNote')}
            hint={t('diary.complete.privateNoteHint')}
            value={privateNote}
            maxLength={PRIVATE_NOTE_MAX}
            multiline
            onChangeText={setPrivateNote}
          />
          {failure ? <Banner tone="danger" message={failure} /> : null}
          <Button title={t('diary.complete.save')} loading={saving} onPress={() => void save()} />
          <Text variant="caption" tone="muted">
            {t('diary.complete.offlineHint')}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { gap: spacing.sm },
});

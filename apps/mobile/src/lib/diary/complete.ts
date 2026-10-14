import type { ProgressLevel, SyncProgressEntry } from '@driveos/shared';
import { v7 as uuidv7 } from 'uuid';
import type { DiaryScope } from './diary';
import type { OpInput } from './queue';
import type { DiaryReader } from './store';
import { diaryLesson, diaryProgress } from './view';

export interface ProgressDraft {
  syllabusItemId: string;
  level: ProgressLevel;
  note: string;
}

export interface CompletionInput {
  lessonId: string;
  progress: readonly ProgressDraft[];
  privateNote: string;
}

export interface StartingPoint {
  level: ProgressLevel;
  note: string;
  entryId: string | null;
}

export interface DatedEntry {
  entry: SyncProgressEntry;
  lessonStart: string | null;
}

export function completionOps(
  input: CompletionInput,
  entryIds: ReadonlyMap<string, string>,
  newId: () => string = uuidv7,
): OpInput[] {
  const { lessonId } = input;
  const ops: OpInput[] = input.progress.map(({ syllabusItemId, level, note }) => ({
    type: 'progress.upsert',
    payload: {
      progressEntryId: entryIds.get(syllabusItemId) ?? newId(),
      lessonId,
      syllabusItemId,
      level,
      note: note.trim(),
    },
  }));
  const body = input.privateNote.trim();
  if (body)
    ops.push({ type: 'private_note.upsert', payload: { privateNoteId: newId(), lessonId, body } });
  ops.push({ type: 'lesson.complete', payload: { lessonId } });
  return ops;
}

const startOrder = (item: DatedEntry) => item.lessonStart ?? '';

export function startingProgress(
  lessonId: string,
  entries: readonly DatedEntry[],
): Map<string, StartingPoint> {
  const result = new Map<string, StartingPoint>();
  const own = entries.filter((item) => item.entry.lessonId === lessonId);
  const earlier = entries
    .filter((item) => item.entry.lessonId !== lessonId)
    .sort((a, b) => startOrder(a).localeCompare(startOrder(b)));
  for (const { entry } of earlier) {
    result.set(entry.syllabusItemId, { level: entry.level, note: '', entryId: null });
  }
  for (const { entry } of own) {
    result.set(entry.syllabusItemId, { level: entry.level, note: entry.note, entryId: entry.id });
  }
  return result;
}

export async function readStartingProgress(
  reader: DiaryReader,
  lessonId: string,
): Promise<Map<string, StartingPoint> | null> {
  const lesson = (await diaryLesson(reader, lessonId))?.lesson;
  if (!lesson) return null;
  const own = (await diaryProgress(reader, lessonId)).map(({ entry }) => entry);
  const others = (await reader.list('progress_entry')).filter(
    (entry) => entry.studentId === lesson.studentId && entry.lessonId !== lessonId,
  );
  const dated = await Promise.all(
    others.map(async (entry) => ({
      entry,
      lessonStart: (await reader.get('lesson', entry.lessonId))?.start ?? null,
    })),
  );
  return startingProgress(lessonId, [
    ...dated,
    ...own.map((entry) => ({ entry, lessonStart: lesson.start })),
  ]);
}

export function completeLesson(
  diary: Pick<DiaryScope, 'enqueueAll'>,
  input: CompletionInput,
  newId?: () => string,
) {
  return diary.enqueueAll(async (reader) => {
    const lesson = (await diaryLesson(reader, input.lessonId))?.lesson;
    if (!lesson) throw new Error('lesson_not_found');
    if (lesson.status !== 'booked') throw new Error('lesson_not_booked');
    const entryIds = new Map(
      (await diaryProgress(reader, input.lessonId)).map(({ entry }) => [
        entry.syllabusItemId,
        entry.id,
      ]),
    );
    return completionOps(input, entryIds, newId);
  });
}

import type { LessonResponse, SyncProgressEntry } from '@driveos/shared';
import { foldLesson, targetLessonId } from './reducer';
import type { DiaryReader } from './store';
import type { QueuedOp, SyncBadge } from './types';

export interface DiaryLesson {
  lesson: LessonResponse;
  sync: SyncBadge;
}

export interface DiaryProgress {
  entry: SyncProgressEntry;
  sync: SyncBadge;
}

export interface DiaryCounts {
  pending: number;
  conflicts: number;
}

function badge(ops: readonly QueuedOp[]): SyncBadge {
  if (ops.some((item) => item.state === 'conflict')) return 'conflict';
  return ops.length > 0 ? 'pending' : 'synced';
}

function opsByLesson(ops: readonly QueuedOp[]): Map<string, QueuedOp[]> {
  const grouped = new Map<string, QueuedOp[]>();
  for (const item of ops) {
    const lessonId = targetLessonId(item.op);
    if (lessonId) grouped.set(lessonId, [...(grouped.get(lessonId) ?? []), item]);
  }
  return grouped;
}

const overlaps = (lesson: LessonResponse, from: string, to: string) =>
  Date.parse(lesson.start) < Date.parse(to) && Date.parse(lesson.end) > Date.parse(from);

function view(lesson: LessonResponse | null, ops: QueuedOp[] = []): DiaryLesson | null {
  const folded = foldLesson(lesson, ops);
  return folded ? { lesson: folded, sync: badge(ops) } : null;
}

export async function diaryLesson(reader: DiaryReader, id: string): Promise<DiaryLesson | null> {
  const ops = opsByLesson(await reader.ops()).get(id);
  return view(await reader.get('lesson', id), ops);
}

export async function diaryLessons(
  reader: DiaryReader,
  range: { from: string; to: string },
): Promise<DiaryLesson[]> {
  const grouped = opsByLesson(await reader.ops());
  const stored = new Map(
    (await reader.lessonsBetween(range.from, range.to)).map((lesson) => [lesson.id, lesson]),
  );
  for (const id of grouped.keys()) {
    if (!stored.has(id)) {
      const lesson = await reader.get('lesson', id);
      if (lesson) stored.set(id, lesson);
    }
  }
  const ids = new Set([...stored.keys(), ...grouped.keys()]);
  return [...ids]
    .map((id) => view(stored.get(id) ?? null, grouped.get(id)))
    .filter((item): item is DiaryLesson => item !== null)
    .filter((item) => overlaps(item.lesson, range.from, range.to))
    .sort((a, b) => Date.parse(a.lesson.start) - Date.parse(b.lesson.start));
}

export async function diaryProgress(
  reader: DiaryReader,
  lessonId: string,
): Promise<DiaryProgress[]> {
  const entries = new Map<string, DiaryProgress>(
    (await reader.list('progress_entry'))
      .filter((entry) => entry.lessonId === lessonId)
      .map((entry) => [entry.id, { entry, sync: 'synced' }]),
  );
  const lesson = await diaryLesson(reader, lessonId);
  for (const item of await reader.ops()) {
    if (item.op.type !== 'progress.upsert' || item.op.payload.lessonId !== lessonId) continue;
    const { progressEntryId, syllabusItemId, level, note } = item.op.payload;
    const existing = entries.get(progressEntryId)?.entry;
    entries.set(progressEntryId, {
      entry: {
        id: progressEntryId,
        lessonId,
        studentId: existing?.studentId ?? lesson?.lesson.studentId ?? '',
        syllabusItemId,
        level,
        note,
        version: (existing?.version ?? 0) + 1,
      },
      sync: item.state === 'conflict' ? 'conflict' : 'pending',
    });
  }
  return [...entries.values()];
}

export async function diaryConflicts(reader: DiaryReader): Promise<QueuedOp[]> {
  return (await reader.ops()).filter((item) => item.state === 'conflict');
}

export function countOps(ops: readonly QueuedOp[]): DiaryCounts {
  const conflicts = ops.filter((item) => item.state === 'conflict').length;
  return { pending: ops.length - conflicts, conflicts };
}

export async function diaryStatus(reader: DiaryReader): Promise<DiaryCounts> {
  return countOps(await reader.ops());
}

import type { LessonResponse } from '@driveos/shared';
import type { AppServices } from './api';
import { failure, type FlowResult, send } from './flow';

export interface LinkedStudent {
  id: string;
  name: string | null;
}

export type ShopProbe = { kind: 'one'; studentId: string } | { kind: 'none' } | { kind: 'several' };

type LessonNames = Pick<LessonResponse, 'studentId' | 'studentName'>;

export function linkedStudentsFrom(
  probe: ShopProbe,
  lessons: readonly LessonNames[],
): LinkedStudent[] {
  const names = new Map<string, string>();
  for (const lesson of lessons) names.set(lesson.studentId, lesson.studentName);
  if (probe.kind === 'none') return [];
  if (probe.kind === 'one')
    return [{ id: probe.studentId, name: names.get(probe.studentId) ?? null }];
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function chooseStudent(
  students: readonly LinkedStudent[],
  selectedId: string | null,
): LinkedStudent | null {
  return students.find((student) => student.id === selectedId) ?? students[0] ?? null;
}

export async function resolveLinkedStudents(
  services: AppServices,
  window: { from: string; to: string },
): Promise<FlowResult<{ students: LinkedStudent[]; complete: boolean }>> {
  const shop = await send(() => services.api.fetchClient.GET('/v1/shop'));
  let probe: ShopProbe;
  if (shop.ok) probe = { kind: 'one', studentId: shop.data.studentId };
  else if (shop.code === 'not_found') probe = { kind: 'none' };
  else if (shop.code === 'validation_error') probe = { kind: 'several' };
  else return failure(shop);
  if (probe.kind === 'none') return { ok: true, students: [], complete: true };

  const lessons = await send(() =>
    services.api.fetchClient.GET('/v1/calendar', {
      params: { query: { ...window, limit: 200 } },
    }),
  );
  if (!lessons.ok) return failure(lessons);
  return {
    ok: true,
    students: linkedStudentsFrom(probe, lessons.data.items),
    complete: probe.kind === 'one',
  };
}

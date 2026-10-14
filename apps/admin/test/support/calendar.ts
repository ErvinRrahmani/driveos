import type { LessonResponse } from '@driveos/shared';
import type { createMockApi } from '@driveos/shared/mocks';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type MockApi = ReturnType<typeof createMockApi>;

export const IDS = {
  stellaLesson: '0192f000-0101-7000-8000-000000000001',
  ingo: '0192f000-0003-7000-8000-000000000003',
  sam: '0192f000-0007-7000-8000-000000000002',
  standardType: '0192f000-0006-7000-8000-000000000001',
  examType: '0192f000-0006-7000-8000-000000000003',
};

export function lessonIn(mock: MockApi, id: string): LessonResponse {
  const record = mock.store.lessons.get(id);
  if (!record) throw new Error(`No lesson ${id}`);
  return record.value;
}

export function addLesson(mock: MockApi, overrides: Partial<LessonResponse> & { id: string }) {
  const base = mock.store.lessons.get(IDS.stellaLesson);
  if (!base) throw new Error('The seeded lesson is missing');
  const value = { ...base.value, ...overrides };
  mock.store.lessons.set(value.id, { schoolId: base.schoolId, version: value.version, value });
  return value;
}

export async function findLessonBlock(name: RegExp | string) {
  const grid = await screen.findByRole('region', { name: 'Calendar grid' });
  return within(grid).findByRole('button', {
    name: typeof name === 'string' ? new RegExp(name) : name,
  });
}

export async function dragWithKeyboard(block: HTMLElement, slots: number) {
  block.focus();
  await userEvent.keyboard('[Space]');
  for (let step = 0; step < Math.abs(slots); step += 1) {
    await userEvent.keyboard(slots > 0 ? '[ArrowDown]' : '[ArrowUp]');
  }
  await userEvent.keyboard('[Space]');
}

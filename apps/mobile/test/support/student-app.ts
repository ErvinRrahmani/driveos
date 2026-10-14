import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { createServices } from '../../src/lib/api';
import { verifyLoginCode } from '../../src/lib/login-flow';
import { studentOverlayHandlers } from '../../src/mock-overlay';
import { memoryStorage } from './memory-storage';

export const STELLA = '+4915550000006';
export const STELLA_STUDENT = '0192f000-0007-7000-8000-000000000001';
export const INGO_MEMBERSHIP = '0192f000-0003-7000-8000-000000000003';
export const GOLF = '0192f000-0005-7000-8000-000000000001';
export const STANDARD_LESSON = '0192f000-0006-7000-8000-000000000001';
export const EXAM_LESSON = '0192f000-0006-7000-8000-000000000003';
export const PACKAGE_ITEM = '0192f000-000c-7000-8000-000000000002';
export const NOW = new Date('2026-10-08T08:00:00.000Z');

export function createStudentMocks() {
  let clock = NOW.getTime();
  const mock = createMockApi({ now: () => new Date(clock) });
  const server = setupServer(...studentOverlayHandlers(mock), ...mock.handlers);
  return {
    mock,
    server,
    setNow: (date: Date) => {
      clock = date.getTime();
    },
    resetClock: () => {
      clock = NOW.getTime();
    },
  };
}

export async function signedInStudent() {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, STELLA, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(`login failed: ${result.code}`);
  return app;
}

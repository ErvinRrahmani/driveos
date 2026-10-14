import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { createServices } from '../../src/lib/api';
import { verifyLoginCode } from '../../src/lib/login-flow';
import { studentOverlayHandlers } from '../../src/mock-overlay';
import { parentOverlayHandlers } from '../../src/parent-overlay';
import { memoryStorage } from './memory-storage';
import { NOW } from './student-app';

export const GUSTAV = '+4915550000011';
export const MIA_STUDENT = '0192f000-0007-7000-8000-000000000005';
export const MIA_MEMBERSHIP = '0192f000-0003-7000-8000-000000000009';
export const MIA_LINK = '0192f000-000a-7000-8000-000000000001';

export function createParentMocks() {
  let clock = NOW.getTime();
  const mock = createMockApi({ now: () => new Date(clock) });
  const server = setupServer(
    ...parentOverlayHandlers(mock),
    ...studentOverlayHandlers(mock),
    ...mock.handlers,
  );
  return {
    mock,
    server,
    resetClock: () => {
      clock = NOW.getTime();
    },
  };
}

export async function signedInParent() {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, GUSTAV, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(`login failed: ${result.code}`);
  return app;
}

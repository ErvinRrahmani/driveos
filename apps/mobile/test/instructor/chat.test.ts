import type { Conversation } from '@driveos/shared';
import { createMockApi, MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/api';
import { conversationTitle } from '../../src/lib/chat';
import { i18n } from '../../src/lib/i18n';
import { verifyLoginCode } from '../../src/lib/login-flow';
import { studentOverlayHandlers } from '../../src/mock-overlay';
import { memoryStorage } from '../support/memory-storage';

const INGO = '+4915550000004';
const t = i18n.t.bind(i18n);

const mock = createMockApi({ now: () => new Date('2026-10-08T08:00:00.000Z') });
const server = setupServer(...studentOverlayHandlers(mock), ...mock.handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => mock.reset());
afterAll(() => server.close());

async function signedInInstructor() {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
    isOnline: () => true,
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, INGO, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(result.code);
  return app;
}

const conversation = (overrides: Partial<Conversation>): Conversation => ({
  id: '0192f000-011a-7000-8000-000000000001',
  kind: 'student_instructor',
  studentId: '0192f000-0007-7000-8000-000000000001',
  studentName: 'Stella Student',
  instructorMembershipId: '0192f000-0003-7000-8000-000000000003',
  instructorName: 'Ingo Instructor',
  readOnly: false,
  schoolCanRead: true,
  unreadCount: 0,
  lastReadMessageId: null,
  lastMessage: null,
  ...overrides,
});

describe('conversationTitle', () => {
  it('names the student for the instructor and the instructor or school for students', () => {
    const chat = conversation({});
    expect(conversationTitle(t, chat, 'instructor')).toBe('Stella Student');
    expect(conversationTitle(t, chat, 'student')).toBe('Ingo Instructor');
    expect(
      conversationTitle(
        t,
        conversation({ kind: 'student_school', instructorName: null }),
        'student',
      ),
    ).toBe('Your driving school');
  });
});

describe('instructor chat against the mocks', () => {
  it('lists conversations, opens a thread and sends a message', async () => {
    const app = await signedInInstructor();
    const list = await app.api.fetchClient.GET('/v1/conversations', {
      params: { query: { limit: 50 } },
    });
    const first = list.data?.items[0];
    if (!first) throw new Error('no conversation');
    expect(conversationTitle(t, first, 'instructor')).toBe(first.studentName);

    const sent = await app.api.fetchClient.POST('/v1/conversations/{id}/messages', {
      params: { path: { id: first.id } },
      body: { body: 'See you at the pickup at 9.' },
    });
    expect(sent.response.ok).toBe(true);
    const thread = await app.api.fetchClient.GET('/v1/conversations/{id}/messages', {
      params: { path: { id: first.id }, query: { limit: 100 } },
    });
    expect(thread.data?.items.map((message) => message.body)).toContain(
      'See you at the pickup at 9.',
    );
  });
});

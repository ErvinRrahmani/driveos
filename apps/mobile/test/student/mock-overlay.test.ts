import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { answerQuestion, finishTheorySession, startTheorySession } from '../../src/lib/theory-flow';
import { createStudentMocks, NOW, signedInStudent } from '../support/student-app';

const { mock, server, resetClock } = createStudentMocks();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  mock.reset();
  resetClock();
});
afterAll(() => server.close());

describe('mobile mock overlay (dev walkthrough only)', () => {
  it('keeps the requested mode and has no deadline in practice', async () => {
    const app = await signedInStudent();
    const started = await startTheorySession(app, 'practice');
    expect(started).toMatchObject({ ok: true, session: { mode: 'practice', deadlineAt: null } });
  });

  it('gives a mock exam a deadline from the pack time limit', async () => {
    const app = await signedInStudent();
    const started = await startTheorySession(app, 'mock');
    expect(started).toMatchObject({
      ok: true,
      session: {
        mode: 'mock',
        deadlineAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
      },
    });
  });

  it('marks answers per question in practice and scores them on finish', async () => {
    const app = await signedInStudent();
    const started = await startTheorySession(app, 'practice');
    if (!started.ok) throw new Error(started.code);
    const [first] = started.session.questions;
    if (!first) throw new Error('no question');
    const right = await answerQuestion(app, started.session.id, first.id, [1]);
    expect(right).toMatchObject({ ok: true, result: { questionId: first.id, correct: true } });
    const finished = await finishTheorySession(app, started.session.id);
    expect(finished).toMatchObject({
      ok: true,
      result: { mode: 'practice', score: first.points, passed: null },
    });
  });

  it('hides correctness during a mock exam', async () => {
    const app = await signedInStudent();
    const started = await startTheorySession(app, 'mock');
    if (!started.ok) throw new Error(started.code);
    const [first] = started.session.questions;
    if (!first) throw new Error('no question');
    expect(await answerQuestion(app, started.session.id, first.id, [1])).toMatchObject({
      ok: true,
      result: { correct: null, correctAnswers: null, explanation: null },
    });
  });

  it('counts mock exams against the weekly allowance in the stats', async () => {
    const app = await signedInStudent();
    const before = await app.api.fetchClient.GET('/v1/theory/stats');
    await startTheorySession(app, 'mock');
    const after = await app.api.fetchClient.GET('/v1/theory/stats');
    expect(after.data?.mockExamsLeftThisWeek).toBe(
      Math.max(0, (before.data?.mockExamsLeftThisWeek ?? 0) - 1),
    );
  });

  it('shows sent chat messages in the thread', async () => {
    const app = await signedInStudent();
    const { data: conversations } = await app.api.fetchClient.GET('/v1/conversations');
    const id = conversations?.items[0]?.id ?? '';
    await app.api.fetchClient.POST('/v1/conversations/{id}/messages', {
      params: { path: { id } },
      body: { body: 'See you at 10' },
    });
    const { data } = await app.api.fetchClient.GET('/v1/conversations/{id}/messages', {
      params: { path: { id } },
    });
    expect(data?.items.map((message) => message.body)).toContain('See you at 10');
  });
});

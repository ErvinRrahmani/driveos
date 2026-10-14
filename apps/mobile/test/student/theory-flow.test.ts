import { createMockApi } from '@driveos/shared/mocks';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  answerQuestion,
  finishTheorySession,
  nextUnanswered,
  startTheorySession,
} from '../../src/lib/theory-flow';
import { signedInStudent } from '../support/student-app';

const mock = createMockApi();
const server = setupServer(...mock.handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => mock.reset());
afterAll(() => server.close());

describe('theory answer flow against the shared handlers', () => {
  it('starts a session, answers a question and finishes with a score', async () => {
    const app = await signedInStudent();
    const started = await startTheorySession(app, 'practice');
    if (!started.ok) throw new Error(started.code);
    expect(started.session.questions.length).toBeGreaterThan(0);
    const first = started.session.questions[0];
    if (!first) throw new Error('no question');

    const answered = await answerQuestion(app, started.session.id, first.id, [0]);
    expect(answered).toMatchObject({ ok: true, result: { correct: expect.any(Boolean) } });
    if (answered.ok) expect(typeof answered.result.explanation).toBe('string');

    const finished = await finishTheorySession(app, started.session.id);
    expect(finished).toMatchObject({
      ok: true,
      result: { score: expect.any(Number), maxScore: expect.any(Number) },
    });
  });

  it('rejects an empty answer before calling the API', async () => {
    const app = await signedInStudent();
    expect(await answerQuestion(app, 'x', 'y', [])).toMatchObject({
      ok: false,
      code: 'validation_error',
    });
  });
});

describe('nextUnanswered', () => {
  const session = {
    questionIds: ['a', 'b', 'c'],
    answeredQuestionIds: ['a'],
  };

  it('resumes at the first question the server has not recorded an answer for', () => {
    expect(nextUnanswered(session, [])).toBe(1);
  });

  it('also skips answers given in this run', () => {
    expect(nextUnanswered(session, ['b'])).toBe(2);
    expect(nextUnanswered(session, ['b', 'c'])).toBeNull();
  });
});

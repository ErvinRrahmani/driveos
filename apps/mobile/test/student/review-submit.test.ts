import { MOCK_LOGIN_CODE } from '@driveos/shared/mocks';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServices } from '../../src/lib/api';
import { verifyLoginCode } from '../../src/lib/login-flow';
import { reviewOutcome, reviewSubmission, submitReview } from '../../src/lib/review-flow';
import { memoryStorage } from '../support/memory-storage';
import { createStudentMocks, STELLA } from '../support/student-app';

const SOFIA = '+4915550000008';
const SIMON = '+4915550000009';

const { mock, server } = createStudentMocks();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  mock.reset();
  server.resetHandlers();
});
afterAll(() => server.close());

async function signedIn(contact: string) {
  const app = createServices({
    baseUrl: 'http://api.test',
    secure: memoryStorage(),
    storage: memoryStorage(),
    fetch: (request) => fetch(request),
  });
  await app.auth.restore();
  const result = await verifyLoginCode(app, contact, MOCK_LOGIN_CODE);
  if (!result.ok) throw new Error(`login failed: ${result.code}`);
  return app;
}

async function send(contact: string, draft: { rating: number | null; text: string }) {
  const submission = reviewSubmission(draft);
  if (!submission.ok) throw new Error(submission.reason);
  return submitReview(await signedIn(contact), submission.body);
}

describe('submitReview', () => {
  it('sends the first review and reports the second as already sent', async () => {
    const first = await send(SOFIA, { rating: 5, text: '  Calm and patient.  ' });
    expect(first.ok).toBe(true);
    const stored = first.ok ? mock.store.reviews.get(first.id)?.value : undefined;
    expect(stored).toMatchObject({ rating: 5, text: 'Calm and patient.', status: 'pending' });

    const second = await send(SOFIA, { rating: 4, text: '' });
    expect(second.ok ? null : reviewOutcome(second)).toBe('already_sent');
  });

  it('reports a student who already has a review on file as already sent', async () => {
    const result = await send(STELLA, { rating: 3, text: '' });
    expect(result.ok ? null : reviewOutcome(result)).toBe('already_sent');
  });

  it('tells a student without a passed practical test that reviews open later', async () => {
    const result = await send(SIMON, { rating: 4, text: 'Nice' });
    expect(result.ok ? null : reviewOutcome(result)).toBe('not_available');
  });
});

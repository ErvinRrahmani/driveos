import type {
  Message,
  SubmitTheoryAnswerRequest,
  TheorySessionMode,
  TheorySessionResponse,
  TheorySessionResult,
  TheoryStatsResponse,
} from '@driveos/shared';
import type { MockApi, MockSession } from '@driveos/shared/mocks';
import { getResponse, http, HttpResponse, type HttpHandler } from 'msw';
import { StatusCodes } from 'http-status-codes';

const MOCK_TIME_LIMIT_MINUTES = 15;
const MOCK_PASS_MARK = 0.8;
const CORRECT_BY_QUESTION: readonly (readonly number[])[] = [
  [1],
  [0],
  [0, 2],
  [1],
  [1],
  [0],
  [1],
  [0, 1],
  [0],
  [2],
  [1],
  [1],
];

interface OverlaySession {
  mode: TheorySessionMode;
  deadlineAt: string | null;
  questions: { id: string; points: number }[];
  answers: Map<string, number[]>;
  finished: boolean;
}

const correctFor = (questionId: string): readonly number[] =>
  CORRECT_BY_QUESTION[parseInt(questionId.slice(-12), 16) - 1] ?? [0];

const sameAnswers = (given: readonly number[], correct: readonly number[]) =>
  given.length === correct.length && correct.every((index) => given.includes(index));

const explanationFor = (questionId: string) =>
  `Mock explanation: the correct answer is option ${correctFor(questionId)
    .map((index) => index + 1)
    .join(' and ')}.`;

export function studentOverlayHandlers(mock: MockApi, baseUrl = '*'): HttpHandler[] {
  const base = baseUrl.replace(/\/$/, '');
  const sessions = new Map<string, OverlaySession>();
  const sentMessages = new Map<string, Message[]>();
  let mocksStarted = 0;
  const { store } = mock;

  const sessionOf = (request: Request): MockSession | null => {
    const header = request.headers.get('authorization');
    if (!header) return store.currentSession();
    return store.sessions.get(header.replace(/^Bearer\s+/i, '')) ?? null;
  };

  const delegate = async (request: Request): Promise<Response | undefined> =>
    getResponse(mock.handlers, request);

  return [
    http.get(`${base}/v1/shop`, async ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.has('studentId')) return undefined;
      const session = sessionOf(request);
      const student = [...store.students.values()].find(
        (record) => session !== null && record.value.userId === session.userId,
      );
      if (!student) return undefined;
      url.searchParams.set('studentId', student.value.id);
      return delegate(new Request(url, { headers: request.headers }));
    }),

    http.post(`${base}/v1/theory/sessions`, async ({ request }) => {
      const { mode } = (await request.clone().json()) as { mode: TheorySessionMode };
      const response = await delegate(request);
      if (!response?.ok) return response;
      const started = (await response.json()) as TheorySessionResponse;
      const now = store.now().getTime();
      const deadlineAt =
        mode === 'mock' ? new Date(now + MOCK_TIME_LIMIT_MINUTES * 60_000).toISOString() : null;
      if (mode === 'mock') mocksStarted += 1;
      sessions.set(started.id, {
        mode,
        deadlineAt,
        questions: started.questions.map(({ id, points }) => ({ id, points })),
        answers: new Map(),
        finished: false,
      });
      return HttpResponse.json(
        {
          ...started,
          mode,
          startedAt: new Date(now).toISOString(),
          deadlineAt,
          answeredQuestionIds: [],
          finishedAt: null,
        } satisfies TheorySessionResponse,
        { status: StatusCodes.CREATED },
      );
    }),

    http.post(`${base}/v1/theory/sessions/:id/answers`, async ({ request, params }) => {
      const session = sessions.get(String(params.id));
      if (!session) return undefined;
      const response = await delegate(request.clone());
      if (!response?.ok) return response;
      const { questionId, given } = (await request.json()) as SubmitTheoryAnswerRequest;
      if (
        session.finished ||
        (session.deadlineAt && store.now().getTime() > Date.parse(session.deadlineAt))
      ) {
        return HttpResponse.json(
          { error: { code: 'theory_session_closed', message: 'The session is over.' } },
          { status: StatusCodes.CONFLICT },
        );
      }
      session.answers.set(questionId, given);
      const practice = session.mode !== 'mock';
      return HttpResponse.json({
        questionId,
        correct: practice ? sameAnswers(given, correctFor(questionId)) : null,
        correctAnswers: practice ? [...correctFor(questionId)] : null,
        explanation: practice ? explanationFor(questionId) : null,
        answeredAt: store.isoNow(),
      });
    }),

    http.post(`${base}/v1/theory/sessions/:id/finish`, async ({ request, params }) => {
      const id = String(params.id);
      const session = sessions.get(id);
      if (!session) return undefined;
      const response = await delegate(request);
      if (!response?.ok) return response;
      session.finished = true;
      const results = session.questions.map(({ id: questionId, points }) => {
        const given = session.answers.get(questionId) ?? null;
        return {
          questionId,
          given,
          correct: given !== null && sameAnswers(given, correctFor(questionId)),
          correctAnswers: [...correctFor(questionId)],
          points,
          explanation: explanationFor(questionId),
        };
      });
      const maxScore = results.reduce((sum, result) => sum + result.points, 0);
      const score = results.reduce((sum, result) => sum + (result.correct ? result.points : 0), 0);
      return HttpResponse.json({
        id,
        mode: session.mode,
        score,
        maxScore,
        passed: session.mode === 'mock' ? score >= maxScore * MOCK_PASS_MARK : null,
        finishedAt: store.isoNow(),
        results,
      } satisfies TheorySessionResult);
    }),

    http.get(`${base}/v1/theory/stats`, async ({ request }) => {
      const response = await delegate(request);
      if (!response?.ok) return response;
      const stats = (await response.json()) as TheoryStatsResponse;
      return HttpResponse.json({
        ...stats,
        mockExamsTaken: stats.mockExamsTaken + mocksStarted,
        mockExamsLeftThisWeek:
          stats.mockExamsLeftThisWeek === null
            ? null
            : Math.max(0, stats.mockExamsLeftThisWeek - mocksStarted),
      } satisfies TheoryStatsResponse);
    }),

    http.post(`${base}/v1/conversations/:id/messages`, async ({ request, params }) => {
      const response = await delegate(request.clone());
      if (!response?.ok) return response;
      const session = sessionOf(request);
      const { body } = (await request.json()) as { body: string };
      const conversationId = String(params.id);
      const message: Message = {
        id: store.nextId(),
        conversationId,
        senderUserId: session?.userId ?? '',
        senderName: session ? store.userName(session.userId) : '',
        body,
        sentAt: store.isoNow(),
      };
      sentMessages.set(conversationId, [...(sentMessages.get(conversationId) ?? []), message]);
      return HttpResponse.json(message, { status: StatusCodes.CREATED });
    }),

    http.get(`${base}/v1/conversations/:id/messages`, async ({ request, params }) => {
      const response = await delegate(request);
      if (!response?.ok) return response;
      const page = (await response.json()) as { items: Message[]; nextCursor: string | null };
      const extra = (sentMessages.get(String(params.id)) ?? []).map((message) => ({
        ...message,
      }));
      return HttpResponse.json({
        ...page,
        items: [
          ...page.items.map((message) => ({ ...message, conversationId: String(params.id) })),
          ...extra,
        ],
      });
    }),
  ];
}

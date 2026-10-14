import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient, type components, type paths } from '../src/client/index.js';
import { createMockApi, scenarios } from '../src/mocks/index.js';
import { StatusCodes } from 'http-status-codes';

const LESSON_ID = '0192f000-0010-7000-8000-000000000001';
const STUDENT_ID = '0192f000-0005-7000-8000-000000000001';

function recordingClient(status = StatusCodes.OK, body: unknown = {}) {
  const seen: { method: string; url: string; headers: Headers; body: string }[] = [];
  const { fetchClient } = createApiClient({
    baseUrl: 'http://api.test',
    fetch: async (request: Request) => {
      seen.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: await request.text(),
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { fetchClient, seen };
}

type LessonBody = paths['/v1/lessons']['post']['requestBody']['content']['application/json'];
type CalendarQuery = NonNullable<paths['/v1/calendar']['get']['parameters']['query']>;

describe('generated client covers the SPEC §8 contract', () => {
  it('types POST /v1/lessons with its body and the Idempotency-Key header', async () => {
    const { fetchClient, seen } = recordingClient(StatusCodes.CREATED, { id: LESSON_ID });
    const body: LessonBody = {
      studentId: STUDENT_ID,
      instructorMembershipId: STUDENT_ID,
      lessonTypeId: STUDENT_ID,
      start: '2026-10-12T08:00:00.000Z',
    };

    const { data } = await fetchClient.POST('/v1/lessons', {
      params: { header: { 'Idempotency-Key': 'key-1' } },
      body,
    });

    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('http://api.test/v1/lessons');
    expect(seen[0]?.headers.get('Idempotency-Key')).toBe('key-1');
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual(body);
    expect(data?.id).toBe(LESSON_ID);
  });

  it('types path and query parameters of the new routes', async () => {
    const { fetchClient, seen } = recordingClient();
    const query: CalendarQuery = { from: '2026-10-12T00:00:00Z', to: '2026-10-19T00:00:00Z' };

    await fetchClient.GET('/v1/calendar', { params: { query } });
    await fetchClient.POST('/v1/lessons/{id}/cancel', {
      params: { path: { id: LESSON_ID } },
      body: {},
    });
    await fetchClient.GET('/v1/students/{id}/balance', { params: { path: { id: STUDENT_ID } } });
    await fetchClient.GET('/v1/reports/growth', { params: { query: { month: '2026-09' } } });

    expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET http://api.test/v1/calendar?from=2026-10-12T00%3A00%3A00Z&to=2026-10-19T00%3A00%3A00Z',
      `POST http://api.test/v1/lessons/${LESSON_ID}/cancel`,
      `GET http://api.test/v1/students/${STUDENT_ID}/balance`,
      'GET http://api.test/v1/reports/growth?month=2026-09',
    ]);
  });

  it('rejects untyped calls at compile time', () => {
    const { fetchClient } = recordingClient();
    const compileOnly = () => {
      // @ts-expect-error the route does not exist
      void fetchClient.GET('/v1/not-a-route');
      // @ts-expect-error bookings need the Idempotency-Key header
      void fetchClient.POST('/v1/lessons', { body: {} as LessonBody });
      // @ts-expect-error the cancel route needs the lesson id
      void fetchClient.POST('/v1/lessons/{id}/cancel', { body: {} });
    };
    expect(typeof compileOnly).toBe('function');
  });

  it('exposes the invoice PDF as a binary response', () => {
    type Pdf =
      paths['/v1/invoices/{id}.pdf']['get']['responses'][StatusCodes.OK]['content']['application/pdf'];
    const pdf: Pdf = 'binary';
    expect(pdf).toBe('binary');
  });
});

describe('generated client against the mock API', () => {
  const server = setupServer(...createMockApi({ seed: scenarios.loggedInAs('office') }).handlers);
  const { fetchClient } = createApiClient({
    baseUrl: 'http://api.test',
    fetch: (request: Request) => fetch(request),
  });
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it('types an identity route: POST /v1/auth/verify → SessionResponse', async () => {
    const { data, response } = await fetchClient.POST('/v1/auth/verify', {
      body: { contact: 'olga.office@example.com', code: '000000', client: 'web' },
    });
    expectTypeOf(data).toEqualTypeOf<components['schemas']['SessionResponse'] | undefined>();
    expect(response.status).toBe(StatusCodes.OK);
    expect(data?.memberships[0]?.roles).toEqual(['office']);
  });

  it('types a list route with the cursor query', async () => {
    const first = await fetchClient.GET('/v1/students', { params: { query: { limit: 3 } } });
    const cursor = first.data?.nextCursor ?? undefined;
    const next = await fetchClient.GET('/v1/students', { params: { query: { cursor, limit: 3 } } });
    expectTypeOf(next.data).toEqualTypeOf<
      components['schemas']['StudentListResponse'] | undefined
    >();
    expect(first.data?.items).toHaveLength(3);
    expect(next.data).toMatchObject({ nextCursor: null });
    expect(next.data?.items).toHaveLength(2);
  });

  it('types the invoice PDF route as a Blob', async () => {
    const { data, response } = await fetchClient.GET('/v1/invoices/{id}.pdf', {
      params: { path: { id: LESSON_ID } },
      parseAs: 'blob',
    });
    expectTypeOf(data).toEqualTypeOf<Blob | undefined>();
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect((await data?.text())?.startsWith('%PDF-')).toBe(true);
  });
});

import type { LessonResponse } from '@driveos/shared';
import type { MockApi } from '@driveos/shared/mocks';
import { getResponse, http, HttpResponse, type HttpHandler } from 'msw';
import { StatusCodes } from 'http-status-codes';

const apiError = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

const notFound = () => apiError(StatusCodes.NOT_FOUND, 'not_found', 'Not found.');

export function parentOverlayHandlers(mock: MockApi, baseUrl = '*'): HttpHandler[] {
  const base = baseUrl.replace(/\/$/, '');
  const { store } = mock;

  const parentOf = (request: Request): string | null => {
    const header = request.headers.get('authorization');
    const session = header
      ? store.sessions.get(header.replace(/^Bearer\s+/i, ''))
      : store.currentSession();
    const membership = session?.activeMembershipId
      ? store.memberships.get(session.activeMembershipId)
      : undefined;
    if (!session || !membership?.roles.includes('parent') || membership.roles.includes('student')) {
      return null;
    }
    return session.userId;
  };

  const linkedIds = (userId: string): string[] =>
    [...store.students.values()]
      .filter((record) =>
        record.value.guardians.some(
          (link) =>
            link.guardianUserId === userId && link.consentAt !== null && link.revokedAt === null,
        ),
      )
      .map((record) => record.value.id);

  const delegate = (request: Request) => getResponse(mock.handlers, request);

  const guardQuery =
    (param: string) =>
    ({ request }: { request: Request }) => {
      const userId = parentOf(request);
      const studentId = new URL(request.url).searchParams.get(param);
      if (userId === null || studentId === null) return undefined;
      return linkedIds(userId).includes(studentId) ? undefined : notFound();
    };

  const guardBody = async ({ request }: { request: Request }) => {
    const userId = parentOf(request);
    if (userId === null) return undefined;
    const { studentId } = (await request.clone().json()) as { studentId?: string };
    return studentId !== undefined && !linkedIds(userId).includes(studentId)
      ? notFound()
      : undefined;
  };

  return [
    http.post(`${base}/v1/guardians/:linkId/consent`, async ({ request, params }) => {
      const userId = parentOf(request);
      if (userId === null) return undefined;
      const { consentTextVersion } = (await request.json()) as { consentTextVersion: string };
      const record = [...store.students.values()].find((candidate) =>
        candidate.value.guardians.some(
          (link) => link.id === params.linkId && link.guardianUserId === userId,
        ),
      );
      const link = record?.value.guardians.find((candidate) => candidate.id === params.linkId);
      if (!record || !link || link.revokedAt !== null) return notFound();
      if (link.consentAt === null) {
        link.consentAt = store.isoNow();
        link.consentTextVersion = consentTextVersion;
        for (const membership of store.memberships.values()) {
          if (
            membership.userId === record.value.userId &&
            membership.schoolId === record.schoolId &&
            membership.status === 'pending_consent'
          ) {
            membership.status = 'active';
          }
        }
      }
      return HttpResponse.json({ id: link.id, version: 2 });
    }),

    http.get(`${base}/v1/shop`, async ({ request }) => {
      const userId = parentOf(request);
      if (userId === null) return undefined;
      const url = new URL(request.url);
      const linked = linkedIds(userId);
      const requested = url.searchParams.get('studentId');
      if (requested !== null) return linked.includes(requested) ? undefined : notFound();
      const [only, ...more] = linked;
      if (only === undefined) return notFound();
      if (more.length > 0)
        return apiError(StatusCodes.BAD_REQUEST, 'validation_error', 'Choose a student');
      url.searchParams.set('studentId', only);
      return delegate(new Request(url, { headers: request.headers }));
    }),

    http.get(`${base}/v1/calendar`, async ({ request }) => {
      const userId = parentOf(request);
      if (userId === null) return undefined;
      const linked = linkedIds(userId);
      const requested = new URL(request.url).searchParams.get('studentId');
      if (requested !== null) return linked.includes(requested) ? undefined : notFound();
      const response = await delegate(request);
      if (!response?.ok) return response;
      const page = (await response.json()) as { items: LessonResponse[] };
      return HttpResponse.json({
        ...page,
        items: page.items.filter((lesson) => linked.includes(lesson.studentId)),
      });
    }),

    http.get(`${base}/v1/students/:id/:section`, ({ request, params }) => {
      const userId = parentOf(request);
      if (userId === null) return undefined;
      return linkedIds(userId).includes(String(params.id)) ? undefined : notFound();
    }),
    http.get(`${base}/v1/invoices`, guardQuery('studentId')),
    http.get(`${base}/v1/documents`, guardQuery('ownerStudentId')),
    http.post(`${base}/v1/lessons`, guardBody),
    http.post(`${base}/v1/checkout`, guardBody),
  ];
}

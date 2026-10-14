/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as dto from '../src/dto/index.js';
import { DTO_SAMPLES, SAMPLE_IDS } from '../src/dto/samples/index.js';
import {
  createMockApi,
  handlers,
  MOCK_ROUTES,
  scenarios,
  type MockRoute,
} from '../src/mocks/index.js';
import { StatusCodes } from 'http-status-codes';

const BASE = 'http://api.test';
const NOW = new Date('2026-10-08T08:00:00.000Z');
const api = createMockApi({ now: () => NOW });
const server = setupServer(...api.handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => api.reset());

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

function schemaFor(component: string): z.ZodType {
  const schema = (dto as Record<string, unknown>)[`${lowerFirst(component)}Schema`];
  if (!schema) throw new Error(`no schema for ${component}`);
  return schema as z.ZodType;
}

function sampleFor(component: string): unknown {
  for (const samples of Object.values(DTO_SAMPLES)) {
    const sample = (samples as Record<string, unknown>)[lowerFirst(component)];
    if (sample !== undefined) return sample;
  }
  return undefined;
}

const ID_BY_PREFIX: [string, string][] = [
  ['/v1/memberships/', SAMPLE_IDS.officeMembership],
  ['/v1/price-items/', SAMPLE_IDS.priceItem],
  ['/v1/lesson-types/', SAMPLE_IDS.lessonType],
  ['/v1/lessons/', SAMPLE_IDS.lesson],
  ['/v1/students/', SAMPLE_IDS.student],
  ['/v1/branches/', SAMPLE_IDS.branch],
  ['/v1/vehicles/', SAMPLE_IDS.vehicle],
  ['/v1/platform/plans/', SAMPLE_IDS.soloPlan],
  ['/v1/guardians/', SAMPLE_IDS.guardianLink],
  ['/v1/instructors/', SAMPLE_IDS.instructorMembership],
  ['/v1/waiting-list/', SAMPLE_IDS.waitingList],
  ['/v1/leads/', SAMPLE_IDS.lead],
  ['/v1/reviews/', SAMPLE_IDS.review],
];

const QUERY: Record<string, string> = {
  'calendar.get': '?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z',
  'shop.get': `?studentId=${SAMPLE_IDS.student}`,
  'reports.noShows': '?from=2026-09-01&to=2026-09-30',
  'reports.revenue': '?from=2026-09-01&to=2026-09-30',
  'reports.passRate': '?from=2026-09-01&to=2026-09-30',
  'reports.utilisation': '?from=2026-09-01&to=2026-09-30',
};

/** Routes only a particular caller may use; everything else runs as the owner. */
const CALLER: Record<string, string> = {
  // A student who passed the practical test and has not reviewed yet.
  'reviews.submit': '+4915550000008',
};

async function login(contact = '+4915550000002') {
  const response = await fetch(`${BASE}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact, code: '000000', client: 'web' }),
  });
  return { response, session: (await response.json()) as dto.SessionResponse };
}

async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; idempotencyKey?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    response,
    text,
    json:
      text && response.headers.get('content-type')?.includes('json')
        ? (JSON.parse(text) as unknown)
        : null,
  };
}

async function requestFor(route: MockRoute, token: string) {
  let path = route.path;
  const params: Record<string, string> = { provider: 'fake', slug: 'fahrschule-spree' };
  if (route.operationId === 'acceptInvitation') {
    const created = await call('POST', '/v1/invitations', {
      token,
      body: { roles: ['office'], email: 'new.office@example.com' },
    });
    params.token = (created.json as dto.CreateInvitationResponse).acceptToken ?? '';
  }
  const prefix = ID_BY_PREFIX.find(([candidate]) => path.startsWith(candidate));
  params.id = prefix ? prefix[1] : SAMPLE_IDS.document;
  params.linkId = SAMPLE_IDS.guardianLink;
  params.lessonId = SAMPLE_IDS.lesson;
  path = path.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '');
  path += QUERY[route.operationId] ?? '';
  const session = api.store.currentSession();
  const identityBodies: Record<string, unknown> = {
    requestLoginCode: { contact: '+4915550000002' },
    verifyLoginCode: { contact: '+4915550000002', code: '000000', client: 'web' },
    refreshSession: { refreshToken: session?.refreshToken },
    logout: { refreshToken: session?.refreshToken },
    switchSchool: { membershipId: SAMPLE_IDS.ownerMembership, client: 'web' },
    registerDevice: { platform: 'ios', pushToken: 'push-token', locale: 'en' },
    createInvitation: { roles: ['office'], email: 'new.office@example.com' },
    acceptInvitation: { fullName: 'Nora New' },
    updateMembership: { roles: ['office'] },
    'waitingList.join': {
      ...DTO_SAMPLES.scheduling.joinWaitingListRequest,
      studentId: SAMPLE_IDS.student,
    },
    'slotOffers.create': {
      ...DTO_SAMPLES.scheduling.createSlotOfferRequest,
      start: '2026-10-15T14:00:00.000Z',
    },
    'lessons.book': {
      ...DTO_SAMPLES.scheduling.bookLessonRequest,
      start: '2026-10-13T07:00:00.000Z',
    },
  };
  const body =
    route.operationId in identityBodies
      ? identityBodies[route.operationId]
      : route.request
        ? sampleFor(route.request)
        : undefined;
  return { path, body };
}

describe('MSW mocks', () => {
  it('has one route per OpenAPI operation and one handler per route', () => {
    const document = JSON.parse(
      readFileSync(new URL('../../../apps/api/openapi.json', import.meta.url), 'utf8'),
    ) as { paths: Record<string, Record<string, { operationId: string }>> };
    const operationIds = Object.values(document.paths).flatMap((item) =>
      Object.values(item).map((operation) => operation.operationId),
    );
    expect(MOCK_ROUTES.map((route) => route.operationId).sort()).toEqual(operationIds.sort());
    expect(api.handlers).toHaveLength(MOCK_ROUTES.length);
    expect(handlers).toHaveLength(MOCK_ROUTES.length);
  });

  it.each(MOCK_ROUTES.map((route) => [route.operationId, route] as const))(
    '%s returns the documented status and body',
    async (_operationId, route) => {
      const { session } = await login(CALLER[route.operationId]);
      const { path, body } = await requestFor(route, session.accessToken);
      const result = await call(route.method.toUpperCase(), path, {
        body,
        token: session.accessToken,
        idempotencyKey: route.idempotent ? `key-${route.operationId}` : undefined,
      });
      expect({ status: result.status, body: result.json }).toMatchObject({ status: route.status });
      if (route.produces === 'pdf') {
        expect(result.response.headers.get('content-type')).toBe('application/pdf');
        expect(result.text.startsWith('%PDF-')).toBe(true);
      } else if (route.produces === 'none') {
        expect(result.text).toBe('');
      } else {
        const parsed = schemaFor(route.response ?? '').safeParse(result.json);
        expect(parsed.error?.issues ?? []).toEqual([]);
      }
    },
  );

  it('rejects calls without a session', async () => {
    const result = await call('GET', '/v1/students');
    expect(result.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(dto.errorResponseSchema.parse(result.json).error.code).toBe('unauthenticated');
  });

  it('books a lesson, lowers the balance and rejects a clash with 409 lesson_conflict', async () => {
    const { session } = await login();
    const token = session.accessToken;
    const before = await call('GET', `/v1/students/${SAMPLE_IDS.secondStudent}/balance`, { token });
    const booked = await call('POST', '/v1/lessons', {
      token,
      idempotencyKey: 'book-sam',
      body: {
        studentId: SAMPLE_IDS.secondStudent,
        instructorMembershipId: SAMPLE_IDS.instructorMembership,
        lessonTypeId: SAMPLE_IDS.lessonType,
        vehicleId: SAMPLE_IDS.vehicle,
        start: '2026-10-13T07:00:00.000Z',
      },
    });
    expect(booked.status).toBe(StatusCodes.CREATED);
    expect(dto.lessonResponseSchema.parse(booked.json)).toMatchObject({
      end: '2026-10-13T08:00:00.000Z',
      studentName: 'Sam Schulz',
      status: 'booked',
    });
    const after = await call('GET', `/v1/students/${SAMPLE_IDS.secondStudent}/balance`, { token });
    const minutes = (value: unknown) =>
      dto.studentBalanceResponseSchema.parse(value).balanceMinutes;
    expect(minutes(after.json)).toBe(minutes(before.json) - 60);

    const clash = await call('POST', '/v1/lessons', {
      token,
      idempotencyKey: 'book-sofia',
      body: {
        studentId: SAMPLE_IDS.minorStudent,
        instructorMembershipId: SAMPLE_IDS.instructorMembership,
        lessonTypeId: SAMPLE_IDS.lessonType,
        start: '2026-10-13T07:30:00.000Z',
      },
    });
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(dto.errorResponseSchema.parse(clash.json).error.code).toBe('lesson_conflict');

    const calendar = await call(
      'GET',
      `/v1/calendar?from=2026-10-13T00:00:00.000Z&to=2026-10-14T00:00:00.000Z&studentId=${SAMPLE_IDS.secondStudent}`,
      { token },
    );
    expect(dto.calendarResponseSchema.parse(calendar.json).items).toHaveLength(1);
  });

  it('restores credits on a staff cancel even inside the window', async () => {
    const { session } = await login();
    const token = session.accessToken;
    const early = await call('POST', `/v1/lessons/${SAMPLE_IDS.lesson}/cancel`, {
      token,
      body: {},
    });
    expect(dto.cancelLessonResponseSchema.parse(early.json)).toMatchObject({
      late: false,
      minutesRestored: 60,
    });

    const late = await call('POST', '/v1/lessons', {
      token,
      idempotencyKey: 'tomorrow',
      body: {
        studentId: SAMPLE_IDS.student,
        instructorMembershipId: SAMPLE_IDS.instructorMembership,
        lessonTypeId: SAMPLE_IDS.lessonType,
        start: '2026-10-08T18:00:00.000Z',
      },
    });
    const lessonId = dto.lessonResponseSchema.parse(late.json).id;
    const cancelled = await call('POST', `/v1/lessons/${lessonId}/cancel`, { token, body: {} });
    expect(dto.cancelLessonResponseSchema.parse(cancelled.json)).toMatchObject({
      late: false,
      minutesRestored: 60,
    });
  });

  async function bookLesson(token: string, key: string, start: string) {
    const booked = await call('POST', '/v1/lessons', {
      token,
      idempotencyKey: key,
      body: {
        studentId: SAMPLE_IDS.student,
        instructorMembershipId: SAMPLE_IDS.instructorMembership,
        lessonTypeId: SAMPLE_IDS.lessonType,
        start,
      },
    });
    return dto.lessonResponseSchema.parse(booked.json).id;
  }

  it('lets owner/office keep the credit on a late cancel with restoreCredit false', async () => {
    const token = (await login()).session.accessToken;
    const early = await bookLesson(token, 'keep-early', '2026-10-12T08:00:00.000Z');
    const outside = await call('POST', `/v1/lessons/${early}/cancel`, {
      token,
      body: { restoreCredit: false },
    });
    expect(outside.status).toBe(StatusCodes.BAD_REQUEST);
    expect(dto.errorResponseSchema.parse(outside.json).error.code).toBe('validation_error');

    const lateId = await bookLesson(token, 'keep-late', '2026-10-08T20:00:00.000Z');
    const kept = await call('POST', `/v1/lessons/${lateId}/cancel`, {
      token,
      body: { restoreCredit: false, reason: 'No-show warning' },
    });
    expect(dto.cancelLessonResponseSchema.parse(kept.json)).toMatchObject({
      late: true,
      minutesRestored: 0,
    });
  });

  it('applies the window to students and rejects restoreCredit from students and instructors', async () => {
    const owner = (await login()).session.accessToken;
    const lateId = await bookLesson(owner, 'student-late', '2026-10-08T21:30:00.000Z');
    const instructor = (await login('+4915550000004')).session.accessToken;
    const rejected = await call('POST', `/v1/lessons/${lateId}/cancel`, {
      token: instructor,
      body: { restoreCredit: false },
    });
    expect(rejected.status).toBe(StatusCodes.BAD_REQUEST);

    const student = (await login('+4915550000006')).session.accessToken;
    const withFlag = await call('POST', `/v1/lessons/${lateId}/cancel`, {
      token: student,
      body: { restoreCredit: true },
    });
    expect(withFlag.status).toBe(StatusCodes.BAD_REQUEST);
    const cancelled = await call('POST', `/v1/lessons/${lateId}/cancel`, {
      token: student,
      body: {},
    });
    expect(dto.cancelLessonResponseSchema.parse(cancelled.json)).toMatchObject({
      late: true,
      minutesRestored: 0,
    });
  });

  it('logs in with code 000000, reads /v1/me, switches school, refreshes and logs out', async () => {
    const code = await call('POST', '/v1/auth/code', {
      body: { contact: 'otto.owner@example.com' },
    });
    expect(code.status).toBe(StatusCodes.ACCEPTED);
    const wrong = await call('POST', '/v1/auth/verify', {
      body: { contact: 'otto.owner@example.com', code: '123456', client: 'web' },
    });
    expect(wrong.status).toBe(StatusCodes.UNAUTHORIZED);

    const { response, session } = await login('otto.owner@example.com');
    expect(response.status).toBe(StatusCodes.OK);
    expect(session.activeMembershipId).toBe(SAMPLE_IDS.ownerMembership);
    expect(session.memberships.map((membership) => membership.schoolName)).toEqual([
      'Fahrschule Spree',
    ]);

    const me = await call('GET', '/v1/me', { token: session.accessToken });
    expect(dto.meResponseSchema.parse(me.json)).toMatchObject({
      user: { fullName: 'Otto Owner' },
      active: {
        membershipId: SAMPLE_IDS.ownerMembership,
        roles: ['owner'],
        studentId: null,
        features: ['enrolment_page'],
      },
    });

    const foreign = await call('POST', '/v1/me/switch-school', {
      token: session.accessToken,
      body: { membershipId: SAMPLE_IDS.officeMembership },
    });
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);

    const refreshed = await call('POST', '/v1/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    const next = dto.sessionResponseSchema.parse(refreshed.json);
    expect(next.accessToken).not.toBe(session.accessToken);
    expect((await call('GET', '/v1/me', { token: session.accessToken })).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );

    const logout = await call('POST', '/v1/auth/logout', {
      body: { refreshToken: next.refreshToken },
    });
    expect(logout.status).toBe(StatusCodes.NO_CONTENT);
    expect((await call('GET', '/v1/me', { token: next.accessToken })).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it('accepts an invitation into a new membership', async () => {
    const { session } = await login();
    const created = await call('POST', '/v1/invitations', {
      token: session.accessToken,
      body: { roles: ['instructor'], phone: '+4915550000099' },
    });
    const acceptToken = dto.createInvitationResponseSchema.parse(created.json).acceptToken;
    const accepted = await call('POST', `/v1/invitations/${acceptToken}/accept`, {
      body: { fullName: 'Nina New' },
    });
    expect(dto.acceptInvitationResponseSchema.parse(accepted.json).status).toBe('active');
    expect((await call('POST', `/v1/invitations/${acceptToken}/accept`, { body: {} })).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    const invited = await login('+4915550000099');
    expect(invited.session.memberships[0]).toMatchObject({
      roles: ['instructor'],
      schoolName: 'Fahrschule Spree',
    });
  });

  it('replays an Idempotency-Key and refuses a reused or missing one', async () => {
    const { session } = await login();
    const token = session.accessToken;
    const body = {
      studentId: SAMPLE_IDS.secondStudent,
      instructorMembershipId: SAMPLE_IDS.instructorMembership,
      lessonTypeId: SAMPLE_IDS.lessonType,
      start: '2026-10-15T07:00:00.000Z',
    };
    const first = await call('POST', '/v1/lessons', { token, idempotencyKey: 'same', body });
    const second = await call('POST', '/v1/lessons', { token, idempotencyKey: 'same', body });
    expect(second.status).toBe(StatusCodes.CREATED);
    expect(second.json).toEqual(first.json);
    const ledger = await call('GET', `/v1/students/${SAMPLE_IDS.secondStudent}/ledger`, { token });
    const debits = dto.ledgerListResponseSchema
      .parse(ledger.json)
      .items.filter((entry) => entry.entryType === 'debit');
    expect(debits).toHaveLength(1);

    const reused = await call('POST', '/v1/lessons', {
      token,
      idempotencyKey: 'same',
      body: { ...body, start: '2026-10-16T07:00:00.000Z' },
    });
    expect(reused.status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    const missing = await call('POST', '/v1/lessons', { token, body });
    expect(dto.errorResponseSchema.parse(missing.json).error.code).toBe('idempotency_key_required');
  });

  it('keeps schools apart', async () => {
    const { session } = await login('ines.ferreira@example.com');
    const students = await call('GET', '/v1/students', { token: session.accessToken });
    expect(dto.studentListResponseSchema.parse(students.json).items).toEqual([]);
    const stella = await call('GET', `/v1/students/${SAMPLE_IDS.student}`, {
      token: session.accessToken,
    });
    expect(stella.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('pages lists with cursor and limit', async () => {
    const { session } = await login();
    const page = await call('GET', '/v1/students?limit=2', { token: session.accessToken });
    const first = dto.studentListResponseSchema.parse(page.json);
    expect(first.items).toHaveLength(2);
    const rest = await call('GET', `/v1/students?limit=10&cursor=${first.nextCursor}`, {
      token: session.accessToken,
    });
    expect(dto.studentListResponseSchema.parse(rest.json)).toMatchObject({ nextCursor: null });
    expect(dto.studentListResponseSchema.parse(rest.json).items).toHaveLength(3);
  });

  it('filters invitations by studentId and role', async () => {
    const { session } = await login();
    const token = session.accessToken;
    await call('POST', '/v1/invitations', {
      token,
      body: { roles: ['parent'], email: 'pat.parent@example.com', studentId: SAMPLE_IDS.student },
    });
    await call('POST', '/v1/invitations', {
      token,
      body: { roles: ['office'], email: 'olga.office@example.com' },
    });
    const parents = await call('GET', '/v1/invitations?role=parent', { token });
    const byStudent = await call('GET', `/v1/invitations?studentId=${SAMPLE_IDS.student}`, {
      token,
    });
    for (const res of [parents, byStudent]) {
      const items = dto.invitationListResponseSchema.parse(res.json).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.studentId === SAMPLE_IDS.student)).toBe(true);
    }
  });

  it('logs in a role through scenarios.loggedInAs', async () => {
    const session = scenarios.loggedInAs('student')(api.store);
    const me = await call('GET', '/v1/me', { token: session.accessToken });
    expect(dto.meResponseSchema.parse(me.json)).toMatchObject({
      user: { fullName: 'Stella Student' },
      active: { roles: ['student'], grants: [], studentId: SAMPLE_IDS.student },
    });
    const implicit = await call('GET', '/v1/me');
    expect(implicit.status).toBe(StatusCodes.OK);
  });
});

describe('MSW mocks: leads, public page and reviews', () => {
  const ines = 'ines.ferreira@example.com';

  it('lists leads by status and search text', async () => {
    const token = (await login()).session.accessToken;
    const names = async (query: string) =>
      dto.leadListResponseSchema
        .parse((await call('GET', `/v1/leads${query}`, { token })).json)
        .items.map((lead) => lead.fullName);
    expect(await names('')).toEqual(['Lena Lead', 'Sam Schulz']);
    expect(await names('?status=converted')).toEqual(['Sam Schulz']);
    expect(await names('?q=lena.lead@')).toEqual(['Lena Lead']);
    const ownSchool = (await login(ines)).session.accessToken;
    const foreign = await call('GET', `/v1/leads/${SAMPLE_IDS.lead}`, { token: ownSchool });
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('converts a lead into a student with an invitation, once', async () => {
    const token = (await login()).session.accessToken;
    const body = { dateOfBirth: '2004-05-06', examLanguage: 'en' };
    const converted = await call('POST', `/v1/leads/${SAMPLE_IDS.lead}/convert`, {
      token,
      idempotencyKey: 'convert-1',
      body,
    });
    expect(converted.status).toBe(StatusCodes.CREATED);
    const result = dto.convertLeadResponseSchema.parse(converted.json);
    expect(result.invitationId).not.toBeNull();
    expect(result.parentInvitationId).toBeNull();
    const student = await call('GET', `/v1/students/${result.studentId}`, { token });
    expect(dto.studentResponseSchema.parse(student.json)).toMatchObject({
      fullName: 'Lena Lead',
      phone: '+4915550000020',
    });
    const again = await call('POST', `/v1/leads/${SAMPLE_IDS.lead}/convert`, {
      token,
      idempotencyKey: 'convert-2',
      body,
    });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(dto.errorResponseSchema.parse(again.json).error.code).toBe('lead_already_converted');
    const patch = await call('PATCH', `/v1/leads/${SAMPLE_IDS.lead}`, {
      token,
      body: { status: 'contacted' },
    });
    expect(patch.status).toBe(StatusCodes.CONFLICT);
  });

  it('refuses a manual lead without the plan feature', async () => {
    const token = (await login(ines)).session.accessToken;
    const created = await call('POST', '/v1/leads', {
      token,
      body: DTO_SAMPLES.training.createLeadRequest,
    });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect(dto.errorResponseSchema.parse(created.json).error.code).toBe('feature_not_in_plan');
  });

  it('answers 404 until the profile is saved and keeps slugs unique', async () => {
    const token = (await login(ines)).session.accessToken;
    expect((await call('GET', '/v1/school/public-profile', { token })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const taken = await call('PUT', '/v1/school/public-profile', {
      token,
      body: { slug: 'fahrschule-spree' },
    });
    expect(dto.errorResponseSchema.parse(taken.json).error.code).toBe('slug_taken');
    const reserved = await call('PUT', '/v1/school/public-profile', {
      token,
      body: { slug: 'admin' },
    });
    expect(reserved.status).toBe(StatusCodes.BAD_REQUEST);
    const publish = await call('PUT', '/v1/school/public-profile', {
      token,
      body: { slug: 'escola-tejo', published: true },
    });
    expect(dto.errorResponseSchema.parse(publish.json).error.code).toBe('feature_not_in_plan');
    const saved = await call('PUT', '/v1/school/public-profile', {
      token,
      body: { slug: 'escola-tejo' },
    });
    expect(saved.status).toBe(StatusCodes.OK);
    const profile = await call('GET', '/v1/school/public-profile', { token });
    expect(dto.publicProfileSchema.parse(profile.json)).toMatchObject({
      slug: 'escola-tejo',
      published: false,
      showPrices: true,
      version: 1,
    });
  });

  it('serves the public page from the profile, price flags, instructors and approved reviews', async () => {
    const pageResult = await call('GET', '/v1/public/schools/fahrschule-spree');
    expect(pageResult.status).toBe(StatusCodes.OK);
    const publicPage = dto.publicSchoolPageSchema.parse(pageResult.json);
    expect(publicPage).toMatchObject({
      slug: 'fahrschule-spree',
      name: 'Fahrschule Spree',
      headline: 'Learn to drive in Berlin Mitte',
      whatsappUrl: 'https://wa.me/4915550000002',
      currency: 'EUR',
      instructors: [{ name: 'Ingo Instructor' }],
      reviews: { count: 1, averageRatingTenths: 50 },
      licenceClasses: ['B'],
      consentTextVersion: 'lead-consent.v1',
    });
    expect(publicPage.prices.map((price) => price.name)).toEqual([
      'Single lesson',
      '10-lesson package',
    ]);
    expect(publicPage.reviews.items.map((review) => review.displayName)).toEqual(['Stella S.']);
    expect(publicPage.branches[0]?.openingHours.length).toBeGreaterThan(0);

    const unknown = await call('GET', '/v1/public/schools/nope');
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
    expect(dto.errorResponseSchema.parse(unknown.json).error.code).toBe('school_not_found');
    const profile = api.store.publicProfiles.get(SAMPLE_IDS.school);
    if (profile) api.store.publicProfiles.set(SAMPLE_IDS.school, { ...profile, published: false });
    const hidden = await call('GET', '/v1/public/schools/fahrschule-spree');
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('captures a public lead and ignores a filled honeypot', async () => {
    const leadsBefore = api.store.leads.size;
    const { website: _website, ...request } = DTO_SAMPLES.training.captureLeadRequest;
    const created = await call('POST', '/v1/public/schools/fahrschule-spree/leads', {
      body: request,
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const { id } = dto.captureLeadResponseSchema.parse(created.json);
    expect(api.store.leads.get(id)).toMatchObject({
      schoolId: SAMPLE_IDS.school,
      value: { source: 'page', status: 'new', fullName: 'Mila Minor', isMinor: true },
    });
    const bot = await call('POST', '/v1/public/schools/fahrschule-spree/leads', {
      body: { ...request, fullName: 'Spam Bot', website: 'https://spam.example' },
    });
    expect(bot.status).toBe(StatusCodes.CREATED);
    expect(api.store.leads.size).toBe(leadsBefore + 1);
    const unknown = await call('POST', '/v1/public/schools/nope/leads', { body: request });
    expect(unknown.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('takes one review per student who passed the practical test', async () => {
    const submit = async (contact: string, body: unknown = { rating: 4, text: '  Calm.  ' }) => {
      const token = (await login(contact)).session.accessToken;
      const result = await call('POST', '/v1/reviews', { token, body });
      return { status: result.status, json: result.json };
    };
    const sofia = '+4915550000008';
    const first = await submit(sofia);
    expect(first.status).toBe(StatusCodes.CREATED);
    const { id } = dto.commandResultSchema.parse(first.json);
    expect(api.store.reviews.get(id)).toMatchObject({
      schoolId: SAMPLE_IDS.school,
      value: { displayName: 'Sofia S.', rating: 4, text: 'Calm.', status: 'pending' },
    });
    const code = (result: { json: unknown }) =>
      dto.errorResponseSchema.parse(result.json).error.code;
    const again = await submit(sofia, { rating: 5 });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(code(again)).toBe('review_exists');
    const stella = await submit('+4915550000006');
    expect(stella.status).toBe(StatusCodes.CONFLICT);
    const notPassed = await submit('+4915550000009');
    expect(notPassed.status).toBe(StatusCodes.FORBIDDEN);
    expect(code(notPassed)).toBe('review_not_available');
    const owner = await submit('+4915550000002');
    expect(owner.status).toBe(StatusCodes.NOT_FOUND);
    expect(code(owner)).toBe('not_found');
  });

  it('lists and moderates reviews', async () => {
    const token = (await login()).session.accessToken;
    const pending = await call('GET', '/v1/reviews?status=pending', { token });
    const [review] = dto.reviewListResponseSchema.parse(pending.json).items;
    expect(review).toMatchObject({ displayName: 'Sam S.', status: 'pending' });
    await call('PATCH', `/v1/reviews/${review?.id ?? ''}`, { token, body: { status: 'hidden' } });
    const hidden = await call('GET', '/v1/reviews?status=hidden', { token });
    expect(dto.reviewListResponseSchema.parse(hidden.json).items).toHaveLength(1);
  });
});

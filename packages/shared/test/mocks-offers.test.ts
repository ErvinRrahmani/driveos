import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  noShowReportResponseSchema,
  type SessionResponse,
  slotOfferListResponseSchema,
  waitingListResponseSchema,
} from '../src/dto/index.js';
import { SAMPLE_IDS } from '../src/dto/samples/index.js';
import { createMockApi } from '../src/mocks/index.js';
import { StatusCodes } from 'http-status-codes';

const BASE = 'http://api.test';
const NOW = new Date('2026-10-08T08:00:00.000Z');
const api = createMockApi({ now: () => NOW });
const server = setupServer(...api.handlers);

const OFFICE = '+4915550000002';
const INES = 'ines.ferreira@example.com';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => api.reset());

async function login(contact = OFFICE): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact, code: '000000', client: 'web' }),
  });
  return ((await response.json()) as SessionResponse).accessToken;
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as unknown) : null };
}

const errorCode = (json: unknown) => (json as { error: { code: string } }).error.code;

const join = {
  studentId: SAMPLE_IDS.student,
  lessonTypeId: SAMPLE_IDS.lessonType,
  preferredWindows: [{ weekday: 1, start: '16:00', end: '18:00' }],
  area: 'Mitte',
};

const offer = {
  instructorMembershipId: SAMPLE_IDS.instructorMembership,
  lessonTypeId: SAMPLE_IDS.lessonType,
  start: '2026-10-15T14:00:00.000Z',
};

describe('waiting list mocks', () => {
  it('lists the seeded entry, joins, rejects a duplicate and leaves', async () => {
    const token = await login();
    const seeded = waitingListResponseSchema.parse(
      (await call(token, 'GET', '/v1/waiting-list?active=true')).json,
    );
    expect(seeded.items.map((entry) => entry.studentName)).toEqual(['Sam Schulz']);

    const created = await call(token, 'POST', '/v1/waiting-list', join);
    expect(created.status).toBe(StatusCodes.CREATED);
    const id = (created.json as { id: string }).id;

    const duplicate = await call(token, 'POST', '/v1/waiting-list', join);
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(errorCode(duplicate.json)).toBe('already_on_waiting_list');

    const active = waitingListResponseSchema.parse(
      (await call(token, 'GET', `/v1/waiting-list?active=true&studentId=${SAMPLE_IDS.student}`))
        .json,
    );
    expect(active.items).toMatchObject([
      { id, studentName: 'Stella Student', area: 'Mitte', active: true },
    ]);

    expect((await call(token, 'DELETE', `/v1/waiting-list/${id}`)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    const after = waitingListResponseSchema.parse(
      (await call(token, 'GET', '/v1/waiting-list?active=true')).json,
    );
    expect(after.items.map((entry) => entry.id)).not.toContain(id);
    const all = waitingListResponseSchema.parse(
      (await call(token, 'GET', '/v1/waiting-list')).json,
    );
    expect(all.items.find((entry) => entry.id === id)?.active).toBe(false);
  });

  it('keeps schools apart', async () => {
    const token = await login(INES);
    const list = waitingListResponseSchema.parse(
      (await call(token, 'GET', '/v1/waiting-list')).json,
    );
    expect(list.items).toEqual([]);
    expect((await call(token, 'DELETE', `/v1/waiting-list/${SAMPLE_IDS.waitingList}`)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });
});

describe('slot offer mocks', () => {
  it('creates an open manual offer for named students and lists it by status', async () => {
    const token = await login();
    const created = await call(token, 'POST', '/v1/slot-offers', {
      ...offer,
      studentIds: [SAMPLE_IDS.student],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const id = (created.json as { id: string }).id;

    const open = slotOfferListResponseSchema.parse(
      (await call(token, 'GET', '/v1/slot-offers?status=open')).json,
    );
    expect(open.items.find((item) => item.id === id)).toMatchObject({
      instructorName: 'Ingo Instructor',
      lessonTypeName: 'Standard lesson',
      source: 'manual',
      status: 'open',
      start: '2026-10-15T14:00:00.000Z',
      end: '2026-10-15T15:00:00.000Z',
      expiresAt: '2026-10-08T10:00:00.000Z',
    });
    const taken = slotOfferListResponseSchema.parse(
      (await call(token, 'GET', '/v1/slot-offers?status=taken')).json,
    );
    expect(taken.items).toEqual([]);
  });

  it('offers to the waiting list when no students are named', async () => {
    const token = await login();
    const created = await call(token, 'POST', '/v1/slot-offers', offer);
    expect(created.status).toBe(StatusCodes.CREATED);
  });

  it('answers 409 no_eligible_students when nobody can take the slot', async () => {
    const token = await login();
    await call(token, 'DELETE', `/v1/waiting-list/${SAMPLE_IDS.waitingList}`);
    const created = await call(token, 'POST', '/v1/slot-offers', offer);
    expect(created.status).toBe(StatusCodes.CONFLICT);
    expect(errorCode(created.json)).toBe('no_eligible_students');
  });

  it('answers 409 slot_unavailable for a busy instructor or a slot that starts too soon', async () => {
    const token = await login();
    const busy = [...api.store.lessons.values()].find(
      ({ value }) =>
        value.status === 'booked' &&
        value.instructorMembershipId === SAMPLE_IDS.instructorMembership &&
        Date.parse(value.start) > NOW.getTime() + 3 * 3_600_000,
    );
    expect(busy).toBeDefined();
    const clash = await call(token, 'POST', '/v1/slot-offers', {
      ...offer,
      start: busy?.value.start,
    });
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(errorCode(clash.json)).toBe('slot_unavailable');

    const soon = await call(token, 'POST', '/v1/slot-offers', {
      ...offer,
      start: '2026-10-08T09:00:00.000Z',
    });
    expect(soon.status).toBe(StatusCodes.CONFLICT);
    expect(errorCode(soon.json)).toBe('slot_unavailable');
  });
});

describe('report mocks', () => {
  it('echoes the requested range and bucket', async () => {
    const token = await login();
    const report = noShowReportResponseSchema.parse(
      (await call(token, 'GET', '/v1/reports/no-shows?from=2026-07-01&to=2026-09-30&bucket=month'))
        .json,
    );
    expect(report).toMatchObject({ from: '2026-07-01', to: '2026-09-30', bucket: 'month' });
  });

  it('rejects an invalid range like the API', async () => {
    const token = await login();
    const result = await call(token, 'GET', '/v1/reports/revenue?from=2026-09-30&to=2026-09-01');
    expect(result.status).toBe(StatusCodes.BAD_REQUEST);
    expect(errorCode(result.json)).toBe('validation_error');
  });
});

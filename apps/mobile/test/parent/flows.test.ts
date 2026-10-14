import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLateCancel } from '../../src/lib/cancellation';
import { CONSENT_TEXT_VERSION, fetchInvoicePdf, giveConsent } from '../../src/lib/parent-flows';
import { resolveLinkedStudents } from '../../src/lib/parent-students';
import {
  bookLesson,
  cancelLesson,
  createAttempt,
  signContract,
  startCheckout,
} from '../../src/lib/student-flows';
import {
  createParentMocks,
  MIA_LINK,
  MIA_MEMBERSHIP,
  MIA_STUDENT,
  signedInParent,
} from '../support/parent-app';
import {
  GOLF,
  INGO_MEMBERSHIP,
  NOW,
  PACKAGE_ITEM,
  STANDARD_LESSON,
  STELLA_STUDENT,
} from '../support/student-app';
import { StatusCodes } from 'http-status-codes';

const browser = vi.hoisted(() => ({ openBrowserAsync: vi.fn() }));
vi.mock('expo-web-browser', () => browser);

const { mock, server, resetClock } = createParentMocks();
const keys: (string | null)[] = [];
const bodies: { path: string; body: unknown }[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', async ({ request }) => {
    if (request.headers.has('idempotency-key')) keys.push(request.headers.get('idempotency-key'));
    if (request.method === 'POST') {
      const text = await request.clone().text();
      bodies.push({ path: new URL(request.url).pathname, body: text ? JSON.parse(text) : null });
    }
  });
});
beforeEach(() => {
  mock.reset();
  resetClock();
  keys.length = 0;
  bodies.length = 0;
  browser.openBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
});
afterAll(() => server.close());

let counter = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const at = (hoursFromNow: number) =>
  new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString();

const WINDOW = { from: at(-24 * 90), to: at(24 * 180) };

const booking = (start: string) => ({
  studentId: MIA_STUDENT,
  instructorMembershipId: INGO_MEMBERSHIP,
  lessonTypeId: STANDARD_LESSON,
  vehicleId: GOLF,
  start,
});

async function consentedParent() {
  const app = await signedInParent();
  const consent = await giveConsent(app, MIA_LINK);
  if (!consent.ok) throw new Error(consent.code);
  return app;
}

describe('guardian consent', () => {
  it('shows no linked student before consent', async () => {
    const app = await signedInParent();
    expect(await resolveLinkedStudents(app, WINDOW)).toEqual({
      ok: true,
      students: [],
      complete: true,
    });
    const balance = await app.api.fetchClient.GET('/v1/students/{id}/balance', {
      params: { path: { id: MIA_STUDENT } },
    });
    expect(balance.response.status).toBe(StatusCodes.NOT_FOUND);
  });

  it('sends the consent text version and then shows the linked student', async () => {
    const app = await signedInParent();
    expect(await giveConsent(app, MIA_LINK)).toEqual({ ok: true });
    expect(bodies).toContainEqual({
      path: `/v1/guardians/${MIA_LINK}/consent`,
      body: { consentTextVersion: CONSENT_TEXT_VERSION },
    });
    expect(mock.store.memberships.get(MIA_MEMBERSHIP)?.status).toBe('active');
    expect(await resolveLinkedStudents(app, WINDOW)).toEqual({
      ok: true,
      students: [{ id: MIA_STUDENT, name: null }],
      complete: true,
    });
  });

  it('lists several linked students from their lessons, flagged as possibly incomplete', async () => {
    const app = await consentedParent();
    const stella = mock.store.students.get(STELLA_STUDENT);
    if (!stella) throw new Error('no Stella');
    stella.value.guardians.push({
      id: '0192f000-000a-7000-8000-000000000002',
      guardianUserId: '0192f000-0002-7000-8000-00000000000b',
      fullName: 'Gustav Minor',
      phone: null,
      email: null,
      consentAt: NOW.toISOString(),
      consentTextVersion: CONSENT_TEXT_VERSION,
      revokedAt: null,
    });
    expect(await resolveLinkedStudents(app, WINDOW)).toEqual({
      ok: true,
      students: [{ id: STELLA_STUDENT, name: 'Stella Student' }],
      complete: false,
    });
  });

  it('rejects a link that is not the parent’s', async () => {
    const app = await signedInParent();
    const result = await giveConsent(app, '0192f000-000a-7000-8000-0000000000ff');
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('booking for the linked student', () => {
  it('books with an Idempotency-Key; the server records it as a parent booking', async () => {
    const app = await consentedParent();
    const booked = await bookLesson(app, createAttempt(newKey), booking(at(30)));
    if (!booked.ok) throw new Error(booked.code);
    expect(booked.lesson).toMatchObject({ studentId: MIA_STUDENT, bookedVia: 'parent' });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^00000000-0000-4000-8000-/);
  });

  it('cannot book for a student without consent', async () => {
    const app = await signedInParent();
    const booked = await bookLesson(app, createAttempt(newKey), booking(at(30)));
    expect(booked).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('keeps the credit when cancelling inside the window', async () => {
    const app = await consentedParent();
    const start = at(3);
    const booked = await bookLesson(app, createAttempt(newKey), booking(start));
    if (!booked.ok) throw new Error(booked.code);
    expect(isLateCancel(start, NOW.getTime(), 24)).toBe(true);
    expect(await cancelLesson(app, booked.lesson)).toEqual({
      ok: true,
      late: true,
      minutesRestored: 0,
    });
  });

  it('restores the credit when cancelling before the window', async () => {
    const app = await consentedParent();
    const start = at(30);
    const booked = await bookLesson(app, createAttempt(newKey), booking(start));
    if (!booked.ok) throw new Error(booked.code);
    expect(isLateCancel(start, NOW.getTime(), 24)).toBe(false);
    expect(await cancelLesson(app, booked.lesson)).toEqual({
      ok: true,
      late: false,
      minutesRestored: 60,
    });
  });
});

describe('paying for the linked student', () => {
  it('starts a checkout for the student with an Idempotency-Key and opens the provider page', async () => {
    const app = await consentedParent();
    const result = await startCheckout(app, createAttempt(newKey), {
      priceItemId: PACKAGE_ITEM,
      studentId: MIA_STUDENT,
    });
    expect(result.ok).toBe(true);
    expect(keys).toHaveLength(1);
    expect(browser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(browser.openBrowserAsync.mock.calls[0]?.[0]).toMatch(/^https?:\/\//);
  });

  it('downloads an invoice PDF with the Bearer token', async () => {
    const app = await consentedParent();
    const invoices = await app.api.fetchClient.GET('/v1/invoices', {
      params: { query: { studentId: MIA_STUDENT, limit: 50 } },
    });
    const invoice = invoices.data?.items[0];
    if (!invoice) throw new Error('no invoice');
    const pdf = await fetchInvoicePdf(app, invoice.id);
    if (!pdf.ok) throw new Error(pdf.code);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
  });
});

describe('co-signing a contract', () => {
  it('signs as the guardian', async () => {
    const app = await consentedParent();
    const contractId = '0192f000-0118-7000-8000-000000000001';
    const result = await signContract(app, contractId, 'guardian');
    expect(result.ok).toBe(true);
    expect(bodies).toContainEqual({
      path: `/v1/contracts/${contractId}/sign`,
      body: { role: 'guardian' },
    });
  });
});

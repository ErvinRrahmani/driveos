import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptOffer,
  bookingRecovery,
  bookLesson,
  cancelLesson,
  createAttempt,
  offerRecovery,
  resolveStudentId,
  startCheckout,
} from '../../src/lib/student-flows';
import { isLateCancel } from '../../src/lib/cancellation';
import {
  createStudentMocks,
  GOLF,
  INGO_MEMBERSHIP,
  NOW,
  PACKAGE_ITEM,
  signedInStudent,
  STANDARD_LESSON,
  STELLA_STUDENT,
} from '../support/student-app';
import { StatusCodes } from 'http-status-codes';

const browser = vi.hoisted(() => ({ openBrowserAsync: vi.fn() }));
vi.mock('expo-web-browser', () => browser);

const { mock, server, resetClock } = createStudentMocks();
const keys: (string | null)[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', ({ request }) => {
    if (request.headers.has('idempotency-key')) keys.push(request.headers.get('idempotency-key'));
  });
});
beforeEach(() => {
  mock.reset();
  resetClock();
  keys.length = 0;
  server.resetHandlers();
  browser.openBrowserAsync.mockReset().mockResolvedValue({ type: 'dismiss' });
});
afterAll(() => server.close());

let counter = 0;
const newKey = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const at = (hoursFromNow: number) =>
  new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString();

const booking = (start: string) => ({
  studentId: STELLA_STUDENT,
  instructorMembershipId: INGO_MEMBERSHIP,
  lessonTypeId: STANDARD_LESSON,
  vehicleId: GOLF,
  start,
});

describe('student id', () => {
  it('comes from the shop, which resolves the signed-in student', async () => {
    const app = await signedInStudent();
    expect(await resolveStudentId(app)).toEqual({ ok: true, studentId: STELLA_STUDENT });
  });
});

describe('booking a lesson', () => {
  it('books with an Idempotency-Key and debits the balance', async () => {
    const app = await signedInStudent();
    const result = await bookLesson(app, createAttempt(newKey), booking(at(50)));
    expect(result).toMatchObject({ ok: true, lesson: { status: 'booked', bookedVia: 'student' } });
    expect(keys).toHaveLength(1);
    const { data } = await app.api.fetchClient.GET('/v1/students/{id}/balance', {
      params: { path: { id: STELLA_STUDENT } },
    });
    expect(data?.balanceMinutes).toBe(480);
  });

  it('reuses the same Idempotency-Key when retrying after a network error', async () => {
    const app = await signedInStudent();
    const attempt = createAttempt(newKey);
    server.use(http.post('*/v1/lessons', () => HttpResponse.error(), { once: true }));
    const body = booking(at(50));
    const failed = await bookLesson(app, attempt, body);
    expect(failed).toMatchObject({ ok: false, code: 'network_error' });
    expect(bookingRecovery(failed)).toEqual({ kind: 'retry' });
    const retried = await bookLesson(app, attempt, body);
    expect(retried.ok).toBe(true);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses a new key for the next booking once one went through', async () => {
    const app = await signedInStudent();
    const attempt = createAttempt(newKey);
    await bookLesson(app, attempt, booking(at(50)));
    await bookLesson(app, attempt, booking(at(50)));
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('turns 409 insufficient_balance into a link to the shop', async () => {
    const app = await signedInStudent();
    const attempt = createAttempt(newKey);
    for (let day = 0; day < 9; day += 1) {
      const result = await bookLesson(app, attempt, booking(at(50 + day * 24)));
      expect(result.ok).toBe(true);
    }
    const result = await bookLesson(app, attempt, booking(at(50 + 9 * 24)));
    expect(result).toMatchObject({ ok: false, code: 'insufficient_balance' });
    expect(bookingRecovery(result)).toEqual({ kind: 'buyCredit', href: '/student/shop' });
  });

  it('reports a taken slot as lesson_conflict', async () => {
    const app = await signedInStudent();
    const attempt = createAttempt(newKey);
    await bookLesson(app, attempt, booking(at(50)));
    const result = await bookLesson(app, attempt, booking(at(50.5)));
    expect(result).toMatchObject({ ok: false, code: 'lesson_conflict' });
    expect(bookingRecovery(result)).toEqual({ kind: 'slotTaken' });
  });
});

describe('cancelling a lesson', () => {
  it('keeps the credit inside the window, as the app warned', async () => {
    const app = await signedInStudent();
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

  it('restores the credit before the window', async () => {
    const app = await signedInStudent();
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

describe('accepting a slot offer', () => {
  const OFFER = '0192f000-0105-7000-8000-000000000001';

  it('accepts with an Idempotency-Key', async () => {
    const app = await signedInStudent();
    const result = await acceptOffer(app, createAttempt(newKey), OFFER);
    expect(result).toMatchObject({ ok: true, lesson: { status: 'booked' } });
    expect(keys).toHaveLength(1);
  });

  it('tells the student when the offer is gone (409 offer_unavailable)', async () => {
    const app = await signedInStudent();
    server.use(
      http.post('*/v1/slot-offers/:id/accept', () =>
        HttpResponse.json(
          { error: { code: 'offer_unavailable', message: 'Someone else took it.' } },
          { status: StatusCodes.CONFLICT },
        ),
      ),
    );
    const result = await acceptOffer(app, createAttempt(newKey), OFFER);
    expect(result).toMatchObject({ ok: false, code: 'offer_unavailable' });
    expect(offerRecovery(result)).toEqual({ kind: 'offerGone' });
  });

  it('sends the student to the shop when credit is short', async () => {
    const failure = { ok: false as const, code: 'insufficient_balance', message: null };
    expect(offerRecovery(failure)).toEqual({ kind: 'buyCredit', href: '/student/shop' });
  });
});

describe('checkout', () => {
  it('starts a checkout with an Idempotency-Key and opens the provider page', async () => {
    const app = await signedInStudent();
    const result = await startCheckout(app, createAttempt(newKey), {
      priceItemId: PACKAGE_ITEM,
      studentId: STELLA_STUDENT,
    });
    expect(result).toMatchObject({ ok: true });
    expect(keys).toHaveLength(1);
    expect(browser.openBrowserAsync).toHaveBeenCalledTimes(1);
    expect(browser.openBrowserAsync.mock.calls[0]?.[0]).toMatch(/^http.*fake-pay/);
  });

  it('does not open the browser when the checkout fails', async () => {
    const app = await signedInStudent();
    server.use(
      http.post('*/v1/checkout', () =>
        HttpResponse.json(
          { error: { code: 'checkout_disabled', message: 'Not available.' } },
          { status: StatusCodes.CONFLICT },
        ),
      ),
    );
    const result = await startCheckout(app, createAttempt(newKey), {
      priceItemId: PACKAGE_ITEM,
      studentId: STELLA_STUDENT,
    });
    expect(result).toMatchObject({ ok: false, code: 'checkout_disabled' });
    expect(browser.openBrowserAsync).not.toHaveBeenCalled();
  });
});

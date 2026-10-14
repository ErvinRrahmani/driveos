import { describe, expect, it } from 'vitest';
import {
  dailyDeltas,
  lateMoveDelta,
  lessonContribution,
  paymentDelta,
  slotOfferContribution,
} from '../../../src/modules/reporting/domain/metrics.js';

const BERLIN = 'Europe/Berlin';
const ID = '0192f000-0003-7000-8000-000000000001';

const lesson = {
  lessonId: ID,
  studentId: ID,
  instructorMembershipId: ID,
  lessonTypeId: ID,
  creditMinutes: 45,
  start: '2026-10-31T22:30:00.000Z',
  end: '2026-10-31T23:30:00.000Z',
};

const purchase = {
  paymentId: ID,
  studentId: ID,
  payerUserId: null,
  amountMinor: 30_000,
  currency: 'EUR',
  priceItemId: ID,
  invoiceId: ID,
};

describe('lessonContribution', () => {
  it('books the lesson minutes on the local day of the start', () => {
    expect(lessonContribution('LessonBooked', lesson, BERLIN)).toEqual({
      day: '2026-10-31',
      counts: { instructorMinutesBooked: 60 },
    });
  });

  it('counts a completed lesson as completed and due, keeping the booked minutes', () => {
    expect(lessonContribution('LessonCompleted', lesson, BERLIN).counts).toEqual({
      instructorMinutesBooked: 60,
      lessonsCompleted: 1,
      lessonsDue: 1,
    });
  });

  it('counts a no-show as a no-show and due', () => {
    expect(lessonContribution('LessonMarkedNoShow', lesson, BERLIN).counts).toEqual({
      instructorMinutesBooked: 60,
      noShows: 1,
      lessonsDue: 1,
    });
  });

  it('frees the minutes of a cancelled lesson; a late one keeps the unrestored credit', () => {
    expect(
      lessonContribution('LessonCancelled', { ...lesson, late: false, minutesRestored: 45 }, BERLIN)
        .counts,
    ).toEqual({});
    expect(
      lessonContribution('LessonCancelled', { ...lesson, late: true, minutesRestored: 0 }, BERLIN)
        .counts,
    ).toEqual({ lateCancellations: 1, lateCancelMinutesKept: 45 });
  });

  it('does not count a late cancellation whose credit was restored by an override', () => {
    expect(
      lessonContribution('LessonCancelled', { ...lesson, late: true, minutesRestored: 45 }, BERLIN)
        .counts,
    ).toEqual({});
  });
});

describe('lateMoveDelta', () => {
  const moved = {
    ...lesson,
    start: '2026-11-03T09:00:00.000Z',
    end: '2026-11-03T10:00:00.000Z',
    previousStart: '2026-10-31T22:30:00.000Z',
    creditMinutesDelta: 45,
  };

  it('counts a late move as a kept late cancellation on the previous start day', () => {
    expect(lateMoveDelta({ ...moved, lateCancellation: true }, BERLIN)).toEqual({
      day: '2026-10-31',
      counts: { lateCancellations: 1, lateCancelMinutesKept: 45 },
    });
  });

  it('ignores ordinary moves', () => {
    expect(lateMoveDelta({ ...moved, lateCancellation: false }, BERLIN)).toBeNull();
    expect(lateMoveDelta(moved, BERLIN)).toBeNull();
  });
});

describe('slotOfferContribution', () => {
  const offer = { start: '2026-10-31T22:30:00.000Z', creditMinutes: 90 };

  it('counts an offer on the slot day; acceptance fills it with its credit minutes', () => {
    expect(slotOfferContribution('SlotOfferCreated', offer, BERLIN)).toEqual({
      day: '2026-10-31',
      counts: { slotsOffered: 1 },
    });
    expect(slotOfferContribution('SlotOfferExpired', offer, BERLIN).counts).toEqual({
      slotsOffered: 1,
    });
    expect(slotOfferContribution('SlotOfferAccepted', offer, BERLIN).counts).toEqual({
      slotsOffered: 1,
      slotsFilled: 1,
      slotFillMinutes: 90,
    });
  });
});

describe('paymentDelta', () => {
  const at = new Date('2026-10-31T22:30:00Z');

  it('adds an in-app payment to in-app and recorded revenue on the local day', () => {
    expect(
      paymentDelta(
        'PaymentSucceeded',
        { ...purchase, method: 'in_app', priceItemKind: 'lesson', creditMinutes: 45 },
        at,
        BERLIN,
      ),
    ).toEqual({
      day: '2026-10-31',
      counts: { revenueInAppMinor: 30_000, revenueRecordedMinor: 30_000 },
    });
  });

  it('adds cash and bank payments to recorded revenue only', () => {
    expect(
      paymentDelta(
        'CashPaymentRecorded',
        { ...purchase, method: 'cash', priceItemKind: 'fee' },
        at,
        BERLIN,
      ).counts,
    ).toEqual({ revenueRecordedMinor: 30_000 });
  });

  it('counts upsells and package minutes', () => {
    expect(
      paymentDelta(
        'PaymentSucceeded',
        { ...purchase, method: 'in_app', priceItemKind: 'upsell', amountMinor: 1_500 },
        at,
        BERLIN,
      ).counts,
    ).toEqual({
      revenueInAppMinor: 1_500,
      revenueRecordedMinor: 1_500,
      upsellsSold: 1,
      upsellRevenueMinor: 1_500,
    });
    expect(
      paymentDelta(
        'CashPaymentRecorded',
        { ...purchase, method: 'bank_transfer', priceItemKind: 'package', creditMinutes: 450 },
        at,
        BERLIN,
      ).counts,
    ).toEqual({ revenueRecordedMinor: 30_000, packageMinutesSold: 450 });
  });

  it('subtracts refunds from recorded revenue, and from in-app revenue when refunded in the app', () => {
    expect(
      paymentDelta('RefundIssued', { amountMinor: 5_000, method: 'in_app' }, at, BERLIN).counts,
    ).toEqual({ refundsMinor: 5_000, revenueInAppMinor: -5_000, revenueRecordedMinor: -5_000 });
    expect(
      paymentDelta('RefundIssued', { amountMinor: 5_000, method: 'cash' }, at, BERLIN).counts,
    ).toEqual({ refundsMinor: 5_000, revenueRecordedMinor: -5_000 });
  });
});

describe('dailyDeltas', () => {
  it('applies a first contribution as is', () => {
    expect(dailyDeltas(null, { day: '2026-10-01', counts: { slotsOffered: 1 } })).toEqual([
      { day: '2026-10-01', counts: { slotsOffered: 1 } },
    ]);
  });

  it('applies only the difference on the same day', () => {
    expect(
      dailyDeltas(
        { day: '2026-10-01', counts: { instructorMinutesBooked: 60 } },
        { day: '2026-10-01', counts: { instructorMinutesBooked: 60, noShows: 1, lessonsDue: 1 } },
      ),
    ).toEqual([{ day: '2026-10-01', counts: { noShows: 1, lessonsDue: 1 } }]);
  });

  it('moves a contribution between days', () => {
    expect(
      dailyDeltas(
        { day: '2026-10-01', counts: { instructorMinutesBooked: 60 } },
        { day: '2026-10-02', counts: { instructorMinutesBooked: 90 } },
      ),
    ).toEqual([
      { day: '2026-10-01', counts: { instructorMinutesBooked: -60 } },
      { day: '2026-10-02', counts: { instructorMinutesBooked: 90 } },
    ]);
  });

  it('returns nothing when the contribution did not change', () => {
    const same = { day: '2026-10-01', counts: { slotsOffered: 1 } };
    expect(dailyDeltas(same, same)).toEqual([]);
  });
});

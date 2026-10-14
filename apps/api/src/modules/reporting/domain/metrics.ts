import { localDayOf } from './buckets.js';

export const METRIC_KEYS = [
  'revenueInAppMinor',
  'revenueRecordedMinor',
  'refundsMinor',
  'lessonsCompleted',
  'lessonsDue',
  'lateCancellations',
  'lateCancelMinutesKept',
  'noShows',
  'upsellsSold',
  'upsellRevenueMinor',
  'packageMinutesSold',
  'slotsOffered',
  'slotsFilled',
  'slotFillMinutes',
  'instructorMinutesBooked',
  'leadsCaptured',
  'leadsConverted',
  'leadRevenueMinor',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];
export type MetricCounts = Partial<Record<MetricKey, number>>;

export interface Contribution {
  day: string;
  counts: MetricCounts;
}

export type LessonEventType =
  'LessonBooked' | 'LessonMoved' | 'LessonCancelled' | 'LessonCompleted' | 'LessonMarkedNoShow';

export interface LessonFacts {
  start: string;
  end: string;
  creditMinutes: number;
  late?: boolean;
  minutesRestored?: number;
}

export interface LessonMoveFacts {
  previousStart: string;
  creditMinutesDelta: number;
  lateCancellation?: boolean;
}

export type SlotOfferEventType = 'SlotOfferCreated' | 'SlotOfferAccepted' | 'SlotOfferExpired';

export interface SlotOfferFacts {
  start: string;
  creditMinutes?: number;
}

export type MoneyEventType = 'PaymentSucceeded' | 'CashPaymentRecorded' | 'RefundIssued';

export interface MoneyFacts {
  amountMinor: number;
  method: string;
  priceItemKind?: string;
  creditMinutes?: number;
  /** The payer is a student who came from a lead (`rm_lead_students`). */
  fromLead?: boolean;
}

export type LeadEventType = 'LeadCaptured' | 'LeadConverted';

const MINUTE_MS = 60_000;

function durationMinutes(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / MINUTE_MS);
}

export function lessonContribution(
  type: LessonEventType,
  lesson: LessonFacts,
  zone: string,
): Contribution {
  const day = localDayOf(new Date(lesson.start), zone);
  const booked = { instructorMinutesBooked: durationMinutes(lesson.start, lesson.end) };
  switch (type) {
    case 'LessonCompleted':
      return { day, counts: { ...booked, lessonsCompleted: 1, lessonsDue: 1 } };
    case 'LessonMarkedNoShow':
      return { day, counts: { ...booked, noShows: 1, lessonsDue: 1 } };
    case 'LessonCancelled': {
      const kept = lesson.creditMinutes - (lesson.minutesRestored ?? 0);
      return lesson.late === true && kept > 0
        ? { day, counts: { lateCancellations: 1, lateCancelMinutesKept: kept } }
        : { day, counts: {} };
    }
    default:
      return { day, counts: booked };
  }
}

export function lateMoveDelta(move: LessonMoveFacts, zone: string): Contribution | null {
  if (move.lateCancellation !== true) return null;
  return {
    day: localDayOf(new Date(move.previousStart), zone),
    counts: { lateCancellations: 1, lateCancelMinutesKept: move.creditMinutesDelta },
  };
}

export function slotOfferContribution(
  type: SlotOfferEventType,
  offer: SlotOfferFacts,
  zone: string,
): Contribution {
  const day = localDayOf(new Date(offer.start), zone);
  if (type === 'SlotOfferAccepted') {
    return {
      day,
      counts: { slotsOffered: 1, slotsFilled: 1, slotFillMinutes: offer.creditMinutes ?? 0 },
    };
  }
  return { day, counts: { slotsOffered: 1 } };
}

export function paymentDelta(
  type: MoneyEventType,
  money: MoneyFacts,
  occurredAt: Date,
  zone: string,
): Contribution {
  const day = localDayOf(occurredAt, zone);
  const amount = money.amountMinor;
  const inApp = money.method === 'in_app';
  if (type === 'RefundIssued') {
    return {
      day,
      counts: {
        refundsMinor: amount,
        ...(inApp ? { revenueInAppMinor: -amount } : {}),
        revenueRecordedMinor: -amount,
      },
    };
  }
  const counts: MetricCounts = {
    ...(type === 'PaymentSucceeded' && inApp ? { revenueInAppMinor: amount } : {}),
    revenueRecordedMinor: amount,
  };
  if (money.priceItemKind === 'upsell') {
    counts.upsellsSold = 1;
    counts.upsellRevenueMinor = amount;
  }
  if (money.priceItemKind === 'package' && money.creditMinutes) {
    counts.packageMinutesSold = money.creditMinutes;
  }
  if (money.fromLead === true) counts.leadRevenueMinor = amount;
  return { day, counts };
}

/** A captured or converted lead counts on the local day it happened (`capturedAt`/`convertedAt`). */
export function leadContribution(type: LeadEventType, at: string, zone: string): Contribution {
  const day = localDayOf(new Date(at), zone);
  return type === 'LeadCaptured'
    ? { day, counts: { leadsCaptured: 1 } }
    : { day, counts: { leadsConverted: 1 } };
}

function nonZero(counts: MetricCounts): MetricCounts {
  return Object.fromEntries(
    Object.entries(counts).filter(([, value]) => value !== 0 && value !== undefined),
  );
}

export function dailyDeltas(previous: Contribution | null, next: Contribution): Contribution[] {
  const byDay = new Map<string, MetricCounts>();
  const add = (day: string, counts: MetricCounts, sign: number) => {
    const current = byDay.get(day) ?? {};
    for (const key of METRIC_KEYS) {
      const value = counts[key];
      if (value !== undefined) current[key] = (current[key] ?? 0) + sign * value;
    }
    byDay.set(day, current);
  };
  if (previous) add(previous.day, previous.counts, -1);
  add(next.day, next.counts, 1);
  return [...byDay.entries()]
    .map(([day, counts]) => ({ day, counts: nonZero(counts) }))
    .filter((delta) => Object.keys(delta.counts).length > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
}

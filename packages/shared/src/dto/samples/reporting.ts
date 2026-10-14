import type {
  GrowthReport,
  GrowthReportQuery,
  NoShowBucket,
  NoShowReportResponse,
  PassRateBucket,
  PassRateReportResponse,
  ReportRangeQuery,
  RevenueBucket,
  RevenueReportResponse,
  UtilisationBucket,
  UtilisationReportResponse,
} from '../reporting.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const range = { from: '2026-09-01', to: '2026-09-30', bucket: 'week' } as const;

const noShowBucket = {
  period: '2026-09-01',
  lessonsDue: 48,
  noShows: 2,
  noShowRateBp: 417,
} satisfies NoShowBucket;

const revenueBucket = {
  period: '2026-09-01',
  currency: 'EUR',
  revenueInAppMinor: 120000,
  revenueRecordedMinor: 145000,
  refundsMinor: 6000,
  upsellsSold: 3,
  upsellRevenueMinor: 23700,
  packageMinutesSold: 1200,
} satisfies RevenueBucket;

const passRateBucket = {
  period: '2026-09-01',
  kind: 'practical',
  attempts: 4,
  passed: 3,
  passRateBp: 7500,
} satisfies PassRateBucket;

const utilisationBucket = {
  period: '2026-09-01',
  instructorMinutesAvailable: 7200,
  instructorMinutesBooked: 5760,
  utilisationBp: 8000,
  slotsOffered: 5,
  slotsFilled: 3,
  slotFillMinutes: 180,
} satisfies UtilisationBucket;

export const reportingSamples = {
  growthReportQuery: { month: '2026-09' } satisfies GrowthReportQuery,
  growthReport: {
    id: ids.growthReport,
    month: '2026-09',
    currency: 'EUR',
    revenueInAppMinor: 480000,
    revenueRecordedMinor: 600000,
    inappShareBp: 8000,
    lateCancellationsKept: 3,
    lateCancelMinutesKept: 180,
    noShowRateBp: 350,
    noShowRatePrev3mBp: 520,
    upsellsSold: 9,
    upsellRevenueMinor: 71100,
    slotsFilled: 11,
    slotFillMinutes: 660,
    leadsCaptured: 14,
    leadsConverted: 5,
    leadRevenueMinor: 210000,
    generatedAt: '2026-10-01T01:00:00.000Z',
  } satisfies GrowthReport,
  reportRangeQuery: range satisfies ReportRangeQuery,
  noShowBucket,
  noShowReportResponse: {
    ...range,
    items: [noShowBucket, { period: '2026-09-08', lessonsDue: 52, noShows: 1, noShowRateBp: 192 }],
    totals: { lessonsDue: 100, noShows: 3, noShowRateBp: 300 },
  } satisfies NoShowReportResponse,
  revenueBucket,
  revenueReportResponse: {
    ...range,
    items: [revenueBucket],
    totals: {
      currency: 'EUR',
      revenueInAppMinor: 120000,
      revenueRecordedMinor: 145000,
      refundsMinor: 6000,
      upsellsSold: 3,
      upsellRevenueMinor: 23700,
      packageMinutesSold: 1200,
    },
  } satisfies RevenueReportResponse,
  passRateBucket,
  passRateReportResponse: {
    ...range,
    items: [
      passRateBucket,
      { ...passRateBucket, kind: 'theory', attempts: 6, passed: 5, passRateBp: 8333 },
    ],
    totals: [
      { kind: 'practical', attempts: 4, passed: 3, passRateBp: 7500 },
      { kind: 'theory', attempts: 6, passed: 5, passRateBp: 8333 },
    ],
  } satisfies PassRateReportResponse,
  utilisationBucket,
  utilisationReportResponse: {
    ...range,
    items: [utilisationBucket],
    totals: {
      instructorMinutesAvailable: 7200,
      instructorMinutesBooked: 5760,
      utilisationBp: 8000,
      slotsOffered: 5,
      slotsFilled: 3,
      slotFillMinutes: 180,
    },
  } satisfies UtilisationReportResponse,
};

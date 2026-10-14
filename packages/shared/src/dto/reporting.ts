import { z } from 'zod';
import {
  amountMinorSchema,
  basisPointsSchema,
  currencySchema,
  dateSchema,
  dateTimeSchema,
  monthSchema,
} from './common.js';
import { reportBucketSchema, testAttemptKindSchema } from './enums.js';

export const REPORT_RANGE_MAX_DAYS = 366;

const DAY_MS = 86_400_000;
const count = z.number().int().nonnegative();

export const growthReportQuerySchema = z.object({ month: monthSchema.optional() });
export type GrowthReportQuery = z.infer<typeof growthReportQuerySchema>;

export const growthReportSchema = z.object({
  id: z.uuid(),
  month: monthSchema,
  currency: currencySchema,
  revenueInAppMinor: amountMinorSchema,
  revenueRecordedMinor: amountMinorSchema,
  inappShareBp: basisPointsSchema,
  lateCancellationsKept: count,
  lateCancelMinutesKept: count,
  noShowRateBp: basisPointsSchema,
  noShowRatePrev3mBp: basisPointsSchema,
  upsellsSold: count,
  upsellRevenueMinor: amountMinorSchema,
  slotsFilled: count,
  slotFillMinutes: count,
  generatedAt: dateTimeSchema,
});
export type GrowthReport = z.infer<typeof growthReportSchema>;

export const reportRangeQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    bucket: reportBucketSchema.default('day'),
  })
  .refine((range) => range.from <= range.to, { message: 'from must not be after to', path: ['to'] })
  .refine(
    (range) => Date.parse(range.to) - Date.parse(range.from) < REPORT_RANGE_MAX_DAYS * DAY_MS,
    {
      message: `A report covers at most ${REPORT_RANGE_MAX_DAYS} days`,
      path: ['to'],
    },
  );
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

const range = { from: dateSchema, to: dateSchema, bucket: reportBucketSchema };

const noShowFields = { lessonsDue: count, noShows: count, noShowRateBp: basisPointsSchema };

export const noShowBucketSchema = z.object({ period: dateSchema, ...noShowFields });
export type NoShowBucket = z.infer<typeof noShowBucketSchema>;

export const noShowReportResponseSchema = z.object({
  ...range,
  items: z.array(noShowBucketSchema),
  totals: z.object(noShowFields),
});
export type NoShowReportResponse = z.infer<typeof noShowReportResponseSchema>;

const revenueFields = {
  currency: currencySchema,
  revenueInAppMinor: amountMinorSchema,
  revenueRecordedMinor: amountMinorSchema,
  refundsMinor: amountMinorSchema,
  upsellsSold: count,
  upsellRevenueMinor: amountMinorSchema,
  packageMinutesSold: count,
};

export const revenueBucketSchema = z.object({ period: dateSchema, ...revenueFields });
export type RevenueBucket = z.infer<typeof revenueBucketSchema>;

export const revenueReportResponseSchema = z.object({
  ...range,
  items: z.array(revenueBucketSchema),
  totals: z.object(revenueFields),
});
export type RevenueReportResponse = z.infer<typeof revenueReportResponseSchema>;

const passRateFields = {
  kind: testAttemptKindSchema,
  attempts: count,
  passed: count,
  passRateBp: basisPointsSchema,
};

export const passRateBucketSchema = z.object({ period: dateSchema, ...passRateFields });
export type PassRateBucket = z.infer<typeof passRateBucketSchema>;

export const passRateReportResponseSchema = z.object({
  ...range,
  items: z.array(passRateBucketSchema),
  totals: z.array(z.object(passRateFields)),
});
export type PassRateReportResponse = z.infer<typeof passRateReportResponseSchema>;

const utilisationFields = {
  instructorMinutesAvailable: count,
  instructorMinutesBooked: count,
  utilisationBp: basisPointsSchema,
  slotsOffered: count,
  slotsFilled: count,
  slotFillMinutes: count,
};

export const utilisationBucketSchema = z.object({ period: dateSchema, ...utilisationFields });
export type UtilisationBucket = z.infer<typeof utilisationBucketSchema>;

export const utilisationReportResponseSchema = z.object({
  ...range,
  items: z.array(utilisationBucketSchema),
  totals: z.object(utilisationFields),
});
export type UtilisationReportResponse = z.infer<typeof utilisationReportResponseSchema>;

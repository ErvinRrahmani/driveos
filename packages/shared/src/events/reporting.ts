import { z } from 'zod';
import {
  amountMinorSchema,
  basisPointsSchema,
  currencySchema,
  dateTimeSchema,
  monthSchema,
} from '../dto/common.js';
import { defineEvent } from './define-event.js';

export const GrowthReportGenerated = defineEvent({
  type: 'GrowthReportGenerated',
  version: 1,
  schema: z.object({
    reportId: z.uuid(),
    month: monthSchema,
    ownerUserIds: z.array(z.uuid()),
    currency: currencySchema,
    revenueInAppMinor: amountMinorSchema,
    revenueRecordedMinor: amountMinorSchema,
    inappShareBp: basisPointsSchema,
    lateCancellationsKept: z.number().int().nonnegative(),
    lateCancelMinutesKept: z.number().int().nonnegative(),
    noShowRateBp: basisPointsSchema,
    noShowRatePrev3mBp: basisPointsSchema,
    upsellsSold: z.number().int().nonnegative(),
    upsellRevenueMinor: amountMinorSchema,
    slotsFilled: z.number().int().nonnegative(),
    slotFillMinutes: z.number().int().nonnegative(),
    generatedAt: dateTimeSchema,
  }),
});

import { z } from 'zod';
import { amountMinorSchema, currencySchema, dateTimeSchema } from '../dto/common.js';
import { defineEvent } from './define-event.js';

export const SupportSessionStarted = defineEvent({
  type: 'SupportSessionStarted',
  version: 1,
  schema: z.object({
    sessionId: z.uuid(),
    platformAdminUserId: z.uuid(),
    schoolId: z.uuid(),
    reason: z.string().min(1),
    startedAt: dateTimeSchema,
    expiresAt: dateTimeSchema,
  }),
});

export const SupportSessionEnded = defineEvent({
  type: 'SupportSessionEnded',
  version: 1,
  schema: z.object({
    sessionId: z.uuid(),
    platformAdminUserId: z.uuid(),
    schoolId: z.uuid(),
    endedAt: dateTimeSchema,
    endedBy: z.enum(['admin', 'expiry']),
  }),
});

export const SubscriptionChanged = defineEvent({
  type: 'SubscriptionChanged',
  version: 1,
  schema: z.object({
    subscriptionId: z.uuid(),
    schoolId: z.uuid(),
    planId: z.uuid(),
    planCode: z.string().min(1),
    previousPlanId: z.uuid().nullable(),
    startedAt: dateTimeSchema,
    baseAmountMinor: amountMinorSchema,
    studentFeeMinor: amountMinorSchema,
    currency: currencySchema,
  }),
});

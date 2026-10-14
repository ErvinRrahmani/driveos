import { z } from 'zod';
import {
  amountMinorSchema,
  currencySchema,
  dateTimeSchema,
  minutesSchema,
  monthSchema,
} from '../dto/common.js';
import {
  entitlementKindSchema,
  ledgerEntryTypeSchema,
  paymentMethodSchema,
  platformChargeKindSchema,
  priceItemKindSchema,
  recordedPaymentMethodSchema,
} from '../dto/enums.js';
import { defineEvent } from './define-event.js';

const purchase = {
  paymentId: z.uuid(),
  studentId: z.uuid(),
  payerUserId: z.uuid().nullable(),
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  priceItemId: z.uuid(),
  priceItemKind: priceItemKindSchema,
  creditMinutes: minutesSchema.optional(),
  entitlementKind: entitlementKindSchema.optional(),
};

export const PaymentSucceeded = defineEvent({
  type: 'PaymentSucceeded',
  version: 1,
  schema: z.object({
    ...purchase,
    method: paymentMethodSchema,
    invoiceId: z.uuid(),
  }),
});

export const PaymentFailed = defineEvent({
  type: 'PaymentFailed',
  version: 1,
  schema: z.object({
    paymentId: z.uuid(),
    studentId: z.uuid(),
    payerUserId: z.uuid().nullable(),
    method: paymentMethodSchema,
    amountMinor: amountMinorSchema,
    currency: currencySchema,
    priceItemId: z.uuid(),
    reason: z.string().optional(),
  }),
});

export const CashPaymentRecorded = defineEvent({
  type: 'CashPaymentRecorded',
  version: 1,
  schema: z.object({
    ...purchase,
    method: recordedPaymentMethodSchema,
    invoiceId: z.uuid(),
    recordedByMembershipId: z.uuid(),
  }),
});

export const RefundIssued = defineEvent({
  type: 'RefundIssued',
  version: 1,
  schema: z.object({
    refundId: z.uuid(),
    paymentId: z.uuid(),
    studentId: z.uuid(),
    amountMinor: amountMinorSchema,
    currency: currencySchema,
    minutesRemoved: z.number().int().nonnegative(),
    creditNoteId: z.uuid(),
    method: paymentMethodSchema,
  }),
});

export const LedgerEntryRecorded = defineEvent({
  type: 'LedgerEntryRecorded',
  version: 1,
  schema: z.object({
    entryId: z.uuid(),
    studentId: z.uuid(),
    entryType: ledgerEntryTypeSchema,
    minutes: minutesSchema,
    balanceAfter: minutesSchema,
    lessonId: z.uuid().optional(),
    paymentId: z.uuid().optional(),
    refundId: z.uuid().optional(),
    priceItemId: z.uuid().optional(),
  }),
});

export const EntitlementGranted = defineEvent({
  type: 'EntitlementGranted',
  version: 1,
  schema: z.object({
    entitlementId: z.uuid(),
    studentId: z.uuid(),
    kind: entitlementKindSchema,
    paymentId: z.uuid().nullable(),
    grantedAt: dateTimeSchema,
  }),
});

export const InvoiceIssued = defineEvent({
  type: 'InvoiceIssued',
  version: 1,
  schema: z.object({
    invoiceId: z.uuid(),
    studentId: z.uuid(),
    kind: z.literal('invoice'),
    series: z.string().min(1),
    number: z.number().int().positive(),
    totalMinor: amountMinorSchema,
    currency: currencySchema,
    issuedAt: dateTimeSchema,
    payerUserIds: z.array(z.uuid()).optional(),
  }),
});

export const CreditNoteIssued = defineEvent({
  type: 'CreditNoteIssued',
  version: 1,
  schema: z.object({
    creditNoteId: z.uuid(),
    creditNoteForId: z.uuid(),
    refundId: z.uuid().nullable(),
    studentId: z.uuid(),
    series: z.string().min(1),
    number: z.number().int().positive(),
    totalMinor: amountMinorSchema,
    currency: currencySchema,
    issuedAt: dateTimeSchema,
    payerUserIds: z.array(z.uuid()).optional(),
  }),
});

export const PlatformChargeCreated = defineEvent({
  type: 'PlatformChargeCreated',
  version: 1,
  schema: z.object({
    chargeId: z.uuid(),
    schoolId: z.uuid(),
    kind: platformChargeKindSchema,
    studentId: z.uuid().nullable(),
    periodMonth: monthSchema,
    amountMinor: amountMinorSchema,
    currency: currencySchema,
  }),
});

export const PlatformStatementIssued = defineEvent({
  type: 'PlatformStatementIssued',
  version: 1,
  schema: z.object({
    statementId: z.uuid(),
    schoolId: z.uuid(),
    month: monthSchema,
    totalMinor: amountMinorSchema,
    currency: currencySchema,
    issuedAt: dateTimeSchema,
    ownerUserIds: z.array(z.uuid()),
  }),
});

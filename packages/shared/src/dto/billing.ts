import { z } from 'zod';
import {
  amountMinorSchema,
  booleanQuerySchema,
  currencySchema,
  dateTimeSchema,
  hasSomeField,
  minutesSchema,
  monthSchema,
  NO_FIELDS_MESSAGE,
  pageQuerySchema,
  pageResponseSchema,
} from './common.js';
import {
  entitlementKindSchema,
  invoiceKindSchema,
  invoiceStatusSchema,
  ledgerEntryTypeSchema,
  platformStatementStatusSchema,
  priceItemKindSchema,
  recordedPaymentMethodSchema,
  refundStatusSchema,
} from './enums.js';

export const TAX_RATE_BP_MAX = 10_000;
export const FAKE_PAYMENT_SIGNATURE_HEADER = 'x-fake-signature';

const fromBeforeTo = (range: { from?: string; to?: string }) =>
  range.from === undefined ||
  range.to === undefined ||
  Date.parse(range.from) < Date.parse(range.to);
const FROM_BEFORE_TO = { message: 'from must be before to', path: ['to'] };

const positiveMinor = amountMinorSchema.positive();
const nonNegativeMinor = amountMinorSchema.nonnegative();
const reasonSchema = z.string().trim().min(1).max(500);

const priceItemFields = {
  name: z.string().trim().min(1).max(200),
  kind: priceItemKindSchema,
  creditMinutes: minutesSchema.positive().nullable(),
  entitlementKind: entitlementKindSchema.nullable(),
  amountMinor: nonNegativeMinor,
  currency: currencySchema,
  taxRateBp: z.number().int().min(0).max(TAX_RATE_BP_MAX),
  sortOrder: z.number().int().min(0).max(10_000),
};

const creditsForLessons = (item: { kind?: string; creditMinutes?: number | null }) =>
  !(item.kind === 'lesson' || item.kind === 'package') || item.creditMinutes != null;
const CREDITS_FOR_LESSONS = {
  message: 'Lessons and packages need credit minutes',
  path: ['creditMinutes'],
};

export const priceItemSchema = z.object({
  id: z.uuid(),
  ...priceItemFields,
  active: z.boolean(),
  showOnPublicPage: z.boolean(),
});
export type PriceItem = z.infer<typeof priceItemSchema>;

export const listPriceItemsQuerySchema = pageQuerySchema.extend({
  kind: priceItemKindSchema.optional(),
  active: booleanQuerySchema.optional(),
});
export type ListPriceItemsQuery = z.infer<typeof listPriceItemsQuerySchema>;

export const priceItemListResponseSchema = pageResponseSchema(priceItemSchema);
export type PriceItemListResponse = z.infer<typeof priceItemListResponseSchema>;

export const createPriceItemRequestSchema = z
  .strictObject({
    ...priceItemFields,
    creditMinutes: priceItemFields.creditMinutes.default(null),
    entitlementKind: priceItemFields.entitlementKind.default(null),
    sortOrder: priceItemFields.sortOrder.default(0),
    active: z.boolean().default(true),
    showOnPublicPage: z.boolean().default(false),
  })
  .refine(creditsForLessons, CREDITS_FOR_LESSONS);
export type CreatePriceItemRequest = z.infer<typeof createPriceItemRequestSchema>;

export const updatePriceItemRequestSchema = z
  .strictObject({
    name: priceItemFields.name,
    creditMinutes: priceItemFields.creditMinutes,
    entitlementKind: priceItemFields.entitlementKind,
    amountMinor: priceItemFields.amountMinor,
    taxRateBp: priceItemFields.taxRateBp,
    sortOrder: priceItemFields.sortOrder,
    active: z.boolean(),
    showOnPublicPage: z.boolean(),
  })
  .partial()
  .refine(hasSomeField, { message: NO_FIELDS_MESSAGE });
export type UpdatePriceItemRequest = z.infer<typeof updatePriceItemRequestSchema>;

export const shopQuerySchema = z.object({ studentId: z.uuid().optional() });
export type ShopQuery = z.infer<typeof shopQuerySchema>;

export const shopItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: priceItemKindSchema,
  creditMinutes: minutesSchema.positive().nullable(),
  entitlementKind: entitlementKindSchema.nullable(),
  amountMinor: nonNegativeMinor,
  currency: currencySchema,
  owned: z.boolean(),
});
export type ShopItem = z.infer<typeof shopItemSchema>;

export const shopResponseSchema = z.object({
  studentId: z.uuid(),
  checkoutEnabled: z.boolean(),
  balanceMinutes: minutesSchema,
  items: z.array(shopItemSchema),
});
export type ShopResponse = z.infer<typeof shopResponseSchema>;

export const entitlementSchema = z.object({
  id: z.uuid(),
  kind: entitlementKindSchema,
  paymentId: z.uuid().nullable(),
  grantedAt: dateTimeSchema,
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const studentBalanceResponseSchema = z.object({
  studentId: z.uuid(),
  balanceMinutes: minutesSchema,
  entitlements: z.array(entitlementSchema),
});
export type StudentBalanceResponse = z.infer<typeof studentBalanceResponseSchema>;

export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  entryType: ledgerEntryTypeSchema,
  minutes: minutesSchema,
  balanceAfter: minutesSchema,
  lessonId: z.uuid().nullable(),
  paymentId: z.uuid().nullable(),
  refundId: z.uuid().nullable(),
  priceItemId: z.uuid().nullable(),
  note: z.string().nullable(),
  createdByMembershipId: z.uuid().nullable(),
  createdAt: dateTimeSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const listLedgerQuerySchema = pageQuerySchema
  .extend({ from: dateTimeSchema.optional(), to: dateTimeSchema.optional() })
  .refine(fromBeforeTo, FROM_BEFORE_TO);
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;

export const ledgerListResponseSchema = pageResponseSchema(ledgerEntrySchema);
export type LedgerListResponse = z.infer<typeof ledgerListResponseSchema>;

export const checkoutRequestSchema = z.strictObject({
  priceItemId: z.uuid(),
  studentId: z.uuid().optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  paymentId: z.uuid(),
  checkoutUrl: z.url(),
  provider: z.string(),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const invoiceLineSchema = z.object({
  id: z.uuid(),
  priceItemId: z.uuid().nullable(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unitMinor: amountMinorSchema,
  taxRateBp: z.number().int().min(0).max(TAX_RATE_BP_MAX),
  taxMinor: amountMinorSchema,
  totalMinor: amountMinorSchema,
  currency: currencySchema,
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceSchema = z.object({
  id: z.uuid(),
  kind: invoiceKindSchema,
  creditNoteForId: z.uuid().nullable(),
  studentId: z.uuid(),
  buyerName: z.string(),
  series: z.string(),
  number: z.number().int().positive().nullable(),
  formattedNumber: z.string().nullable(),
  status: invoiceStatusSchema,
  issuedAt: dateTimeSchema.nullable(),
  subtotalMinor: amountMinorSchema,
  taxMinor: amountMinorSchema,
  totalMinor: amountMinorSchema,
  currency: currencySchema,
  paymentId: z.uuid().nullable(),
  refundedMinor: amountMinorSchema.min(0),
  lines: z.array(invoiceLineSchema),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const listInvoicesQuerySchema = pageQuerySchema
  .extend({
    studentId: z.uuid().optional(),
    kind: invoiceKindSchema.optional(),
    status: invoiceStatusSchema.optional(),
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
  })
  .refine(fromBeforeTo, FROM_BEFORE_TO);
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const invoiceListResponseSchema = pageResponseSchema(invoiceSchema);
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

export const invoicePdfParamsSchema = z.object({ id: z.uuid() });
export type InvoicePdfParams = z.infer<typeof invoicePdfParamsSchema>;

export const issueRefundRequestSchema = z.strictObject({
  paymentId: z.uuid(),
  amountMinor: positiveMinor,
  currency: currencySchema,
  minutesRemoved: minutesSchema.nonnegative(),
  reason: reasonSchema,
});
export type IssueRefundRequest = z.infer<typeof issueRefundRequestSchema>;

export const issueRefundResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: refundStatusSchema,
  creditNoteId: z.uuid().nullable(),
});
export type IssueRefundResponse = z.infer<typeof issueRefundResponseSchema>;

export const recordCashPaymentRequestSchema = z.strictObject({
  studentId: z.uuid(),
  priceItemId: z.uuid(),
  method: recordedPaymentMethodSchema,
  amountMinor: positiveMinor,
  currency: currencySchema,
  reference: z.string().trim().min(1).max(100).optional(),
});
export type RecordCashPaymentRequest = z.infer<typeof recordCashPaymentRequestSchema>;

export const recordCashPaymentResponseSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  invoiceId: z.uuid(),
});
export type RecordCashPaymentResponse = z.infer<typeof recordCashPaymentResponseSchema>;

export const adjustLedgerRequestSchema = z.strictObject({
  studentId: z.uuid(),
  minutes: minutesSchema.refine((minutes) => minutes !== 0, { message: 'minutes must not be 0' }),
  note: z.string().trim().min(1).max(500),
  reason: reasonSchema,
  lessonId: z.uuid().optional(),
});
export type AdjustLedgerRequest = z.infer<typeof adjustLedgerRequestSchema>;

export const adjustLedgerResponseSchema = z.object({
  id: z.uuid(),
  balanceAfter: minutesSchema,
});
export type AdjustLedgerResponse = z.infer<typeof adjustLedgerResponseSchema>;

export const paymentWebhookParamsSchema = z.object({
  provider: z.string().regex(/^[a-z0-9_-]{1,40}$/),
});
export type PaymentWebhookParams = z.infer<typeof paymentWebhookParamsSchema>;

export const fakePaymentWebhookEventSchema = z.object({
  type: z.enum(['payment.succeeded', 'payment.failed']),
  providerRef: z.string().min(1).max(200),
  amountMinor: nonNegativeMinor,
  currency: currencySchema,
  occurredAt: dateTimeSchema,
});
export type FakePaymentWebhookEvent = z.infer<typeof fakePaymentWebhookEventSchema>;

export const paymentWebhookResponseSchema = z.object({ received: z.literal(true) });
export type PaymentWebhookResponse = z.infer<typeof paymentWebhookResponseSchema>;

export const listSchoolPlatformStatementsQuerySchema = pageQuerySchema.extend({
  status: platformStatementStatusSchema.optional(),
  month: monthSchema.optional(),
});
export type ListSchoolPlatformStatementsQuery = z.infer<
  typeof listSchoolPlatformStatementsQuerySchema
>;

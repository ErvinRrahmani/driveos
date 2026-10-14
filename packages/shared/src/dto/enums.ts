import { z } from 'zod';

export const schoolStatusSchema = z.enum(['onboarding', 'active', 'suspended']);
export type SchoolStatus = z.infer<typeof schoolStatusSchema>;

export const paymentAccountStatusSchema = z.enum(['pending', 'active', 'disabled']);
export type PaymentAccountStatus = z.infer<typeof paymentAccountStatusSchema>;

export const reviewStatusSchema = z.enum(['pending', 'approved', 'hidden']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const transmissionSchema = z.enum(['manual', 'automatic']);
export type Transmission = z.infer<typeof transmissionSchema>;

export const lessonTypeKindSchema = z.enum(['lesson', 'exam']);
export type LessonTypeKind = z.infer<typeof lessonTypeKindSchema>;

export const entitlementKindSchema = z.enum(['premium_theory', 'exam_car']);
export type EntitlementKind = z.infer<typeof entitlementKindSchema>;

export const lessonEntitlementSchema = entitlementKindSchema.extract(['exam_car']);
export type LessonEntitlement = z.infer<typeof lessonEntitlementSchema>;

export const lessonStatusSchema = z.enum(['booked', 'completed', 'cancelled', 'no_show']);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

export const bookedViaSchema = z.enum([
  'office',
  'instructor',
  'student',
  'parent',
  'slot_offer',
  'sync',
]);
export type BookedVia = z.infer<typeof bookedViaSchema>;

export const slotOfferSourceSchema = z.enum(['cancellation', 'gap', 'manual']);
export type SlotOfferSource = z.infer<typeof slotOfferSourceSchema>;

export const slotOfferStatusSchema = z.enum(['open', 'taken', 'expired', 'withdrawn']);
export type SlotOfferStatus = z.infer<typeof slotOfferStatusSchema>;

export const syncOperationStatusSchema = z.enum(['applied', 'rejected']);
export type SyncOperationStatus = z.infer<typeof syncOperationStatusSchema>;

export const changeFeedOpSchema = z.enum(['upsert', 'delete', 'revoke']);
export type ChangeFeedOp = z.infer<typeof changeFeedOpSchema>;

export const studentStatusSchema = z.enum(['active', 'archived', 'anonymized']);
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const testAttemptKindSchema = z.enum(['theory', 'practical']);
export type TestAttemptKind = z.infer<typeof testAttemptKindSchema>;

export const testAttemptResultSchema = z.enum(['passed', 'failed']);
export type TestAttemptResult = z.infer<typeof testAttemptResultSchema>;

export const priceItemKindSchema = z.enum(['lesson', 'package', 'upsell', 'fee']);
export type PriceItemKind = z.infer<typeof priceItemKindSchema>;

export const ledgerEntryTypeSchema = z.enum([
  'purchase',
  'debit',
  'restore',
  'adjustment',
  'refund',
]);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const paymentMethodSchema = z.enum(['in_app', 'cash', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const recordedPaymentMethodSchema = paymentMethodSchema.extract(['cash', 'bank_transfer']);
export type RecordedPaymentMethod = z.infer<typeof recordedPaymentMethodSchema>;

export const paymentStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const refundStatusSchema = z.enum(['pending', 'succeeded', 'failed']);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const invoiceKindSchema = z.enum(['invoice', 'credit_note']);
export type InvoiceKind = z.infer<typeof invoiceKindSchema>;

export const invoiceStatusSchema = z.enum(['draft', 'issued', 'paid']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const platformChargeKindSchema = z.enum([
  'base_subscription',
  'student_fee',
  'student_fee_reversal',
]);
export type PlatformChargeKind = z.infer<typeof platformChargeKindSchema>;

export const platformStatementStatusSchema = z.enum(['issued', 'paid']);
export type PlatformStatementStatus = z.infer<typeof platformStatementStatusSchema>;

export const statementPaidMethodSchema = z.enum(['bank_transfer', 'cash']);
export type StatementPaidMethod = z.infer<typeof statementPaidMethodSchema>;

export const questionPackStatusSchema = z.enum(['draft', 'published']);
export type QuestionPackStatus = z.infer<typeof questionPackStatusSchema>;

export const theorySessionModeSchema = z.enum(['practice', 'mock', 'mistakes']);
export type TheorySessionMode = z.infer<typeof theorySessionModeSchema>;

export const documentStatusSchema = z.enum(['pending', 'ready']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const contractStatusSchema = z.enum(['pending', 'signed']);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const signerRoleSchema = z.enum(['student', 'guardian', 'school']);
export type SignerRole = z.infer<typeof signerRoleSchema>;

export const conversationKindSchema = z.enum(['student_school', 'student_instructor']);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const notificationChannelSchema = z.enum(['push', 'sms', 'email']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const recordChangeSchema = z.enum(['created', 'updated']);
export type RecordChange = z.infer<typeof recordChangeSchema>;

export const documentKindSchema = z.enum([
  'id_document',
  'medical_certificate',
  'eye_test',
  'first_aid_certificate',
  'photo',
  'learner_permit',
  'other',
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

export const documentMimeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
]);
export type DocumentMime = z.infer<typeof documentMimeSchema>;

export const notificationTimingSchema = z.enum([
  'deferred',
  'advanced',
  'immediate',
  'email_only_at_night',
]);
export type NotificationTiming = z.infer<typeof notificationTimingSchema>;

export const reportBucketSchema = z.enum(['day', 'week', 'month']);
export type ReportBucket = z.infer<typeof reportBucketSchema>;

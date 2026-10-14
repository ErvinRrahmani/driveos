import type { EventPayload } from './define-event.js';
import {
  CashPaymentRecorded,
  CreditNoteIssued,
  EntitlementGranted,
  InvoiceIssued,
  LedgerEntryRecorded,
  PaymentFailed,
  PaymentSucceeded,
  PlatformChargeCreated,
  PlatformStatementIssued,
  RefundIssued,
} from './billing.js';
import {
  ContractCompleted,
  ContractCreated,
  ContractSigned,
  DocumentUploaded,
} from './documents.js';
import {
  InvitationCreated,
  MembershipCreated,
  MembershipDisabled,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
} from './identity.js';
import { DeviceTokenInvalidated, MessageSent } from './messaging.js';
import { SubscriptionChanged, SupportSessionEnded, SupportSessionStarted } from './platform.js';
import { GrowthReportGenerated } from './reporting.js';
import {
  AvailabilityChanged,
  LessonBooked,
  LessonCancelled,
  LessonCompleted,
  LessonMarkedNoShow,
  LessonMoved,
  SlotOfferAccepted,
  SlotOfferCreated,
  SlotOfferExpired,
  TimeOffAdded,
  WaitingListJoined,
} from './scheduling.js';
import {
  BranchChanged,
  PaymentAccountConnected,
  ReviewModerated,
  ReviewSubmitted,
  SchoolCreated,
  SchoolSettingsChanged,
  VehicleChanged,
} from './school.js';
import { QuestionPackPublished, TheorySessionFinished } from './theory.js';
import {
  GuardianConsentGiven,
  GuardianLinked,
  InstructorAssigned,
  InstructorUnassigned,
  ProgressRecorded,
  StudentAnonymized,
  StudentArchived,
  StudentCreated,
  StudentEnrolled,
  TestAttemptRecorded,
} from './training.js';

export const EVENT_CATALOGUE = [
  InvitationCreated,
  MembershipCreated,
  MembershipRolesChanged,
  MembershipPermissionsChanged,
  MembershipDisabled,
  SchoolCreated,
  SchoolSettingsChanged,
  BranchChanged,
  VehicleChanged,
  PaymentAccountConnected,
  ReviewSubmitted,
  ReviewModerated,
  StudentCreated,
  StudentEnrolled,
  StudentArchived,
  StudentAnonymized,
  GuardianLinked,
  GuardianConsentGiven,
  InstructorAssigned,
  InstructorUnassigned,
  ProgressRecorded,
  TestAttemptRecorded,
  LessonBooked,
  LessonMoved,
  LessonCancelled,
  LessonCompleted,
  LessonMarkedNoShow,
  AvailabilityChanged,
  TimeOffAdded,
  WaitingListJoined,
  SlotOfferCreated,
  SlotOfferAccepted,
  SlotOfferExpired,
  PaymentSucceeded,
  PaymentFailed,
  CashPaymentRecorded,
  RefundIssued,
  LedgerEntryRecorded,
  EntitlementGranted,
  InvoiceIssued,
  CreditNoteIssued,
  PlatformChargeCreated,
  PlatformStatementIssued,
  QuestionPackPublished,
  TheorySessionFinished,
  DocumentUploaded,
  ContractCreated,
  ContractSigned,
  ContractCompleted,
  MessageSent,
  DeviceTokenInvalidated,
  GrowthReportGenerated,
  SupportSessionStarted,
  SupportSessionEnded,
  SubscriptionChanged,
] as const;

export type CatalogueEvent = (typeof EVENT_CATALOGUE)[number];
export type EventType = CatalogueEvent['type'];
export type EventPayloadByType = {
  [D in CatalogueEvent as D['type']]: EventPayload<D>;
};

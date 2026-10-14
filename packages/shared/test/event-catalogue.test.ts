import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EVENT_CATALOGUE } from '../src/index.js';
import { EVENT_SAMPLES } from '../src/events/samples.js';

const SPEC_EVENTS = {
  identity: [
    'InvitationCreated',
    'MembershipCreated',
    'MembershipRolesChanged',
    'MembershipPermissionsChanged',
    'MembershipDisabled',
  ],
  school: [
    'SchoolCreated',
    'SchoolSettingsChanged',
    'BranchChanged',
    'VehicleChanged',
    'PaymentAccountConnected',
    'ReviewSubmitted',
    'ReviewModerated',
  ],
  training: [
    'StudentCreated',
    'StudentEnrolled',
    'StudentArchived',
    'StudentAnonymized',
    'GuardianLinked',
    'GuardianConsentGiven',
    'InstructorAssigned',
    'InstructorUnassigned',
    'ProgressRecorded',
    'TestAttemptRecorded',
    'LeadCaptured',
    'LeadStatusChanged',
    'LeadConverted',
  ],
  scheduling: [
    'LessonBooked',
    'LessonMoved',
    'LessonCancelled',
    'LessonCompleted',
    'LessonMarkedNoShow',
    'AvailabilityChanged',
    'TimeOffAdded',
    'WaitingListJoined',
    'SlotOfferCreated',
    'SlotOfferAccepted',
    'SlotOfferExpired',
  ],
  billing: [
    'PaymentSucceeded',
    'PaymentFailed',
    'CashPaymentRecorded',
    'RefundIssued',
    'LedgerEntryRecorded',
    'EntitlementGranted',
    'InvoiceIssued',
    'CreditNoteIssued',
    'PlatformChargeCreated',
    'PlatformStatementIssued',
  ],
  theory: ['QuestionPackPublished', 'TheorySessionFinished'],
  documents: ['DocumentUploaded', 'ContractCreated', 'ContractSigned', 'ContractCompleted'],
  messaging: ['MessageSent', 'DeviceTokenInvalidated'],
  reporting: ['GrowthReportGenerated'],
  platform: ['SupportSessionStarted', 'SupportSessionEnded', 'SubscriptionChanged'],
} as const;

const specNames = Object.values(SPEC_EVENTS).flat();
const samples: Record<string, unknown> = EVENT_SAMPLES;

describe('EVENT_CATALOGUE', () => {
  it('contains exactly the SPEC §3.6 events', () => {
    expect(EVENT_CATALOGUE.map((event) => event.type).sort()).toEqual([...specNames].sort());
  });

  it('has unique types and integer versions >= 1', () => {
    const types = EVENT_CATALOGUE.map((event) => event.type);
    expect(new Set(types).size).toBe(types.length);
    for (const event of EVENT_CATALOGUE) {
      expect(Number.isInteger(event.version) && event.version >= 1).toBe(true);
    }
  });

  it('has exactly one sample per event', () => {
    expect(Object.keys(samples).sort()).toEqual([...specNames].sort());
  });

  it.each(EVENT_CATALOGUE.map((event) => [event.type, event] as const))(
    '%s round-trips its sample through JSON and the schema',
    (type, event) => {
      const sample = samples[type];
      expect(sample).toBeDefined();
      const stored: unknown = JSON.parse(JSON.stringify(sample));
      expect(event.schema.parse(stored)).toEqual(sample);
    },
  );

  it.each(EVENT_CATALOGUE.map((event) => [event.type, event] as const))(
    '%s rejects a payload with a missing field',
    (_type, event) => {
      expect(event.schema.safeParse({}).success).toBe(false);
    },
  );

  it.each(EVENT_CATALOGUE.map((event) => [event.type, event] as const))(
    '%s converts to JSON Schema',
    (_type, event) => {
      expect(() => z.toJSONSchema(event.schema, { io: 'input' })).not.toThrow();
    },
  );
});

describe('event payload conventions', () => {
  const shapeOf = (schema: z.ZodType): Record<string, z.ZodType> =>
    schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : {};

  it.each(EVENT_CATALOGUE.map((event) => [event.type, event] as const))(
    '%s carries a currency next to every money amount',
    (_type, event) => {
      const shape = shapeOf(event.schema);
      const keys = Object.keys(shape);
      // `isMinor` (a person under the age of majority) is a flag, not an amount.
      const moneyKeys = keys.filter(
        (key) => key.endsWith('Minor') && !(shape[key] instanceof z.ZodBoolean),
      );
      if (moneyKeys.length > 0) expect(keys).toContain('currency');
    },
  );
});

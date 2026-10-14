import {
  AvailabilityChanged,
  CashPaymentRecorded,
  type EventPayload,
  LeadCaptured,
  LeadConverted,
  LessonBooked,
  LessonCancelled,
  LessonCompleted,
  LessonMarkedNoShow,
  LessonMoved,
  PaymentSucceeded,
  RefundIssued,
  SlotOfferAccepted,
  SlotOfferCreated,
  SlotOfferExpired,
  TestAttemptRecorded,
  TimeOffAdded,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { Projection } from '../../../kernel/projections/index.js';
import { EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import {
  type Contribution,
  dailyDeltas,
  lateMoveDelta,
  leadContribution,
  type LessonEventType,
  lessonContribution,
  type MoneyEventType,
  paymentDelta,
  type SlotOfferEventType,
  slotOfferContribution,
} from '../domain/metrics.js';
import { MetricsStore } from '../infra/metrics-store.js';
import { SchoolProfiles } from '../infra/school-profile.js';

type LessonPayload =
  | EventPayload<typeof LessonBooked>
  | EventPayload<typeof LessonMoved>
  | EventPayload<typeof LessonCancelled>
  | EventPayload<typeof LessonCompleted>
  | EventPayload<typeof LessonMarkedNoShow>;

type SlotOfferPayload =
  | EventPayload<typeof SlotOfferCreated>
  | EventPayload<typeof SlotOfferAccepted>
  | EventPayload<typeof SlotOfferExpired>;

type MoneyPayload =
  | EventPayload<typeof PaymentSucceeded>
  | EventPayload<typeof CashPaymentRecorded>
  | EventPayload<typeof RefundIssued>;

type LeadPayload = EventPayload<typeof LeadCaptured> | EventPayload<typeof LeadConverted>;

type Payload =
  | LessonPayload
  | SlotOfferPayload
  | MoneyPayload
  | LeadPayload
  | EventPayload<typeof TestAttemptRecorded>
  | EventPayload<typeof AvailabilityChanged>
  | EventPayload<typeof TimeOffAdded>;

const LESSON_EVENTS: ReadonlySet<string> = new Set([
  LessonBooked.type,
  LessonMoved.type,
  LessonCancelled.type,
  LessonCompleted.type,
  LessonMarkedNoShow.type,
]);

const SLOT_OFFER_EVENTS: ReadonlySet<string> = new Set([
  SlotOfferCreated.type,
  SlotOfferAccepted.type,
  SlotOfferExpired.type,
]);

const MONEY_EVENTS: ReadonlySet<string> = new Set([
  PaymentSucceeded.type,
  CashPaymentRecorded.type,
  RefundIssued.type,
]);

@Injectable()
@EventSubscriber({
  name: 'reporting.school-metrics',
  events: [
    LessonBooked,
    LessonMoved,
    LessonCancelled,
    LessonCompleted,
    LessonMarkedNoShow,
    SlotOfferCreated,
    SlotOfferAccepted,
    SlotOfferExpired,
    PaymentSucceeded,
    CashPaymentRecorded,
    RefundIssued,
    TestAttemptRecorded,
    AvailabilityChanged,
    TimeOffAdded,
    LeadCaptured,
    LeadConverted,
  ],
})
export class SchoolMetricsProjection extends Projection<Payload> {
  constructor(
    tenant: TenantContext,
    private readonly store: MetricsStore,
    private readonly schools: SchoolProfiles,
  ) {
    super(tenant);
  }

  protected async apply(event: DomainEvent<Payload>): Promise<void> {
    const schoolId = event.schoolId as string;
    if (event.type === TestAttemptRecorded.type) {
      const attempt = event.payload as EventPayload<typeof TestAttemptRecorded>;
      await this.store.addTestAttempt(
        schoolId,
        attempt.takenOn,
        attempt.kind,
        attempt.result === 'passed',
      );
      return;
    }
    if (event.type === AvailabilityChanged.type) {
      const change = event.payload as EventPayload<typeof AvailabilityChanged>;
      await this.store.addAvailabilityLayer(schoolId, {
        instructorMembershipId: change.instructorMembershipId,
        version: event.aggregateVersion,
        effectiveFrom: change.effectiveFrom,
        effectiveTo: change.effectiveTo ?? null,
        windows: change.windows,
      });
      return;
    }
    if (event.type === TimeOffAdded.type) {
      const off = event.payload as EventPayload<typeof TimeOffAdded>;
      await this.store.addTimeOff(schoolId, off.timeOffId, {
        instructorMembershipId: off.instructorMembershipId,
        start: new Date(off.start),
        end: new Date(off.end),
      });
      return;
    }

    const { timeZone, currency } = await this.schools.current();
    if (MONEY_EVENTS.has(event.type)) {
      const money = event.payload as MoneyPayload;
      // Refunds do not reduce lead revenue, so only payments look up the payer.
      const fromLead =
        event.type !== RefundIssued.type && (await this.store.isLeadStudent(money.studentId));
      const delta = paymentDelta(
        event.type as MoneyEventType,
        { ...money, fromLead },
        event.occurredAt,
        timeZone,
      );
      await this.store.add(schoolId, delta, money.currency);
      return;
    }
    if (event.type === LeadCaptured.type) {
      const lead = event.payload as EventPayload<typeof LeadCaptured>;
      await this.store.add(
        schoolId,
        leadContribution('LeadCaptured', lead.capturedAt, timeZone),
        currency,
      );
      return;
    }
    if (event.type === LeadConverted.type) {
      const lead = event.payload as EventPayload<typeof LeadConverted>;
      const contribution = leadContribution('LeadConverted', lead.convertedAt, timeZone);
      await this.store.addLeadStudent(schoolId, lead.studentId, lead.leadId, contribution.day);
      await this.store.add(schoolId, contribution, currency);
      return;
    }
    if (LESSON_EVENTS.has(event.type)) {
      const lesson = event.payload as LessonPayload;
      const next = lessonContribution(event.type as LessonEventType, lesson, timeZone);
      await this.replace(schoolId, 'lesson', lesson.lessonId, next, currency);
      if (event.type === LessonMoved.type) {
        const late = lateMoveDelta(lesson as EventPayload<typeof LessonMoved>, timeZone);
        if (late) await this.store.add(schoolId, late, currency);
      }
      return;
    }
    if (SLOT_OFFER_EVENTS.has(event.type)) {
      const offer = event.payload as SlotOfferPayload;
      const next = slotOfferContribution(
        event.type as SlotOfferEventType,
        {
          start: offer.start,
          ...('creditMinutes' in offer ? { creditMinutes: offer.creditMinutes } : {}),
        },
        timeZone,
      );
      await this.replace(schoolId, 'slot_offer', offer.offerId, next, currency);
    }
  }

  private async replace(
    schoolId: string,
    sourceType: string,
    sourceId: string,
    next: Contribution,
    currency: string,
  ): Promise<void> {
    const previous = await this.store.replaceSource(schoolId, sourceType, sourceId, next);
    for (const delta of dailyDeltas(previous, next)) {
      await this.store.add(schoolId, delta, currency);
    }
  }
}

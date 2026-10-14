import { SlotOfferCreated, type SlotOfferSource } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { StatusCodes } from 'http-status-codes';
import { EventPublisher, newEvent } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { overlaps, type Period } from '../domain/period.js';
import { offerExpiresAt } from '../domain/slot-offers.js';
import { LessonRecords } from './lesson-records.js';
import { SchoolFacts } from './school-facts.js';
import { SLOT_OFFER_CREATED_VERSION, SlotOfferRecords } from './slot-offer-records.js';
import { SlotOfferAudience } from './slot-offer-audience.js';
import { slotUnavailable, SlotValidator } from './slot-validator.js';
import { ViewerScope } from './viewer-scope.js';

export interface SlotOfferInput {
  instructorMembershipId: string;
  vehicleId: string | null;
  lessonTypeId: string;
  start: Date;
  source: SlotOfferSource;
  studentIds?: readonly string[];
  excludeStudentIds?: readonly string[];
  now?: Date;
}

export interface CreatedSlotOffer {
  id: string;
  version: number;
  offeredToStudentIds: string[];
}

function lessonConflict(period: Period): ConflictError {
  return new ConflictError('lesson_conflict', t('errors.lesson_conflict'), {
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  });
}

@Injectable()
export class SlotOfferCreator {
  constructor(
    private readonly viewer: ViewerScope,
    private readonly slots: SlotValidator,
    private readonly lessons: LessonRecords,
    private readonly school: SchoolFacts,
    private readonly audience: SlotOfferAudience,
    private readonly records: SlotOfferRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async create(input: SlotOfferInput): Promise<CreatedSlotOffer | null> {
    const now = input.now ?? new Date();
    const instructorId = input.instructorMembershipId;
    if (!(await this.viewer.activeInstructorIds()).includes(instructorId)) throw notFound();
    const lessonType = await this.slots.activeLessonType(input.lessonTypeId);
    const { type, period } = await this.slots.validate({
      profile: { licenceClass: lessonType.licenceClass },
      lessonTypeId: lessonType.id,
      instructorMembershipId: instructorId,
      vehicleId: input.vehicleId,
      start: input.start,
      now,
    });
    await this.requireFree(instructorId, input.vehicleId, period);

    const zone = await this.school.timeZone();
    const settings = await this.school.settings();
    const expiresAt = offerExpiresAt(now, period.start, settings.slotOfferTtlMinutes);
    if (expiresAt <= now) throw slotUnavailable('too_soon');

    const audience = await this.audience.resolve({
      slot: {
        lessonTypeId: type.id,
        licenceClass: type.licenceClass,
        creditMinutes: type.creditMinutes,
        instructorMembershipId: instructorId,
        period,
      },
      zone,
      studentIds: input.studentIds,
      excludeStudentIds: input.excludeStudentIds,
    });
    if (audience.studentIds.length === 0) return null;

    const row = await this.records.insert({
      instructorMembershipId: instructorId,
      vehicleId: input.vehicleId,
      lessonTypeId: type.id,
      period,
      source: input.source,
      offeredToStudentIds: audience.studentIds,
      expiresAt,
    });
    await this.publisher.append([
      newEvent(SlotOfferCreated, {
        aggregateType: 'slot_offer',
        aggregateId: row.id,
        aggregateVersion: SLOT_OFFER_CREATED_VERSION,
        payload: {
          offerId: row.id,
          instructorMembershipId: row.instructorMembershipId,
          vehicleId: row.vehicleId,
          lessonTypeId: row.lessonTypeId,
          creditMinutes: type.creditMinutes,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          source: row.source,
          offeredToStudentIds: row.offeredToStudentIds,
          expiresAt: row.expiresAt.toISOString(),
        },
      }),
    ]);
    return {
      id: row.id,
      version: SLOT_OFFER_CREATED_VERSION,
      offeredToStudentIds: row.offeredToStudentIds,
    };
  }

  async createIfStillValid(input: SlotOfferInput): Promise<CreatedSlotOffer | null> {
    try {
      return await this.create(input);
    } catch (error) {
      if (error instanceof ApiError && error.status < StatusCodes.INTERNAL_SERVER_ERROR)
        return null;
      throw error;
    }
  }

  private async requireFree(
    instructorId: string,
    vehicleId: string | null,
    period: Period,
  ): Promise<void> {
    const instructorBusy = (await this.lessons.busyByInstructor([instructorId], period)).get(
      instructorId,
    );
    const vehicleBusy = vehicleId
      ? (await this.lessons.busyByVehicle([vehicleId], period)).get(vehicleId)
      : undefined;
    const clash = [...(instructorBusy ?? []), ...(vehicleBusy ?? [])].find((busy) =>
      overlaps(busy, period),
    );
    if (clash) throw lessonConflict(clash);
  }
}

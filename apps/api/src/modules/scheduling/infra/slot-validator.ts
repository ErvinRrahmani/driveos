import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { t } from '../../../kernel/i18n/i18n.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { StudentBookingProfile } from '../../training/index.js';
import { satisfiesMinGap } from '../domain/gap.js';
import { overlaps, type Period, subtractPeriods } from '../domain/period.js';
import { LessonRecords } from './lesson-records.js';
import { ScheduleWindowsReader } from './schedule-windows.js';
import { lessonTypes } from './schema.js';
import { SchoolFacts } from './school-facts.js';

const MINUTE = 60_000;

export type LessonTypeRow = typeof lessonTypes.$inferSelect;

export type SlotUnavailableReason =
  | 'in_past'
  | 'too_soon'
  | 'licence_class'
  | 'vehicle_licence_class'
  | 'outside_availability'
  | 'min_gap';

export function slotUnavailable(reason: SlotUnavailableReason): ConflictError {
  return new ConflictError('slot_unavailable', t('errors.slot_unavailable'), { reason });
}

export interface SlotRequest {
  profile: Pick<StudentBookingProfile, 'licenceClass'>;
  lessonTypeId: string;
  instructorMembershipId: string;
  vehicleId: string | null;
  start: Date;
  now?: Date;
  excludeLessonId?: string;
}

export interface ValidSlot {
  type: LessonTypeRow;
  period: Period;
}

@Injectable()
export class SlotValidator {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolFacts,
    private readonly windows: ScheduleWindowsReader,
    private readonly lessons: LessonRecords,
  ) {}

  async activeLessonType(id: string): Promise<LessonTypeRow> {
    const [type] = await this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(and(eq(lessonTypes.id, id), eq(lessonTypes.active, true)));
    if (!type) throw notFound();
    return type;
  }

  async validate(request: SlotRequest): Promise<ValidSlot> {
    const { profile, start, vehicleId } = request;
    const type = await this.activeLessonType(request.lessonTypeId);
    if (start.getTime() % MINUTE !== 0) {
      throw invalidField(['start'], 'start must be on a whole minute');
    }
    if (type.requiresVehicle && !vehicleId) {
      throw invalidField(['vehicleId'], 'this lesson type requires a vehicle');
    }
    if (vehicleId) await this.requireVehicle(vehicleId, type.licenceClass);
    if (type.licenceClass !== profile.licenceClass) throw slotUnavailable('licence_class');
    const period = { start, end: new Date(start.getTime() + type.minutes * MINUTE) };
    if (start <= (request.now ?? new Date())) throw slotUnavailable('in_past');

    const instructorId = request.instructorMembershipId;
    const [zone, settings] = await Promise.all([this.school.timeZone(), this.school.settings()]);
    const { availability } = await this.windows.read([instructorId], period, zone);
    if (subtractPeriods(period, availability).length > 0) {
      throw slotUnavailable('outside_availability');
    }
    if (settings.minGapMinutes > 0) {
      const gap = settings.minGapMinutes * MINUTE;
      const around = {
        start: new Date(start.getTime() - gap),
        end: new Date(period.end.getTime() + gap),
      };
      const busy = (
        await this.lessons.busyByInstructor([instructorId], around, request.excludeLessonId)
      ).get(instructorId);
      const others = (busy ?? []).filter((other) => !overlaps(other, period));
      if (!satisfiesMinGap(period, others, settings.minGapMinutes)) {
        throw slotUnavailable('min_gap');
      }
    }
    return { type, period };
  }

  private async requireVehicle(vehicleId: string, licenceClass: string): Promise<void> {
    const vehicle = (await this.school.vehicles(true)).find((car) => car.id === vehicleId);
    if (!vehicle) throw notFound();
    if (vehicle.licenceClass !== licenceClass) throw slotUnavailable('vehicle_licence_class');
  }
}

import { and, asc, eq } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { InstructorPeriod } from '../domain/availability.js';
import { findGaps } from '../domain/free-gaps.js';
import { overlaps, type Period } from '../domain/period.js';
import { SLOT_OFFER_MIN_LEAD_MS } from '../domain/slot-offers.js';
import { addDays, localDateOf, localToUtcOrTransition } from '../domain/time-zone.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { ScheduleWindowsReader } from '../infra/schedule-windows.js';
import { lessonTypes } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { type CreatedSlotOffer, SlotOfferCreator } from '../infra/slot-offer-creator.js';
import { SlotOfferRecords } from '../infra/slot-offer-records.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { ScanSlotGapsCommand } from './scan-slot-gaps.command.js';

const MINUTE = 60_000;

export const GAP_SCAN_DAYS = 7;
export const GAP_OFFERS_PER_INSTRUCTOR = 5;

type LessonTypeRow = typeof lessonTypes.$inferSelect;

@CommandHandler(ScanSlotGapsCommand)
export class ScanSlotGapsHandler implements ICommandHandler<
  ScanSlotGapsCommand,
  { created: number }
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly viewer: ViewerScope,
    private readonly windows: ScheduleWindowsReader,
    private readonly lessons: LessonRecords,
    private readonly school: SchoolFacts,
    private readonly offers: SlotOfferRecords,
    private readonly creator: SlotOfferCreator,
  ) {}

  async execute({ now }: ScanSlotGapsCommand): Promise<{ created: number }> {
    const types = await this.offerableTypes();
    const shortest = types[0];
    const instructors = await this.viewer.activeInstructorIds();
    if (!shortest || instructors.length === 0) return { created: 0 };

    const [zone, settings] = await Promise.all([this.school.timeZone(), this.school.settings()]);
    const range: Period = {
      start: now,
      end: localToUtcOrTransition(addDays(localDateOf(now, zone), GAP_SCAN_DAYS), '00:00', zone),
    };
    const { availability } = await this.windows.read(instructors, range, zone);
    const gaps = findGaps({
      windows: availability.flatMap((window) => clip(window, range)),
      instructorBusy: await this.lessons.busyByInstructor(instructors, range),
      minMinutes: shortest.minutes,
      minGapMinutes: settings.minGapMinutes,
      notBefore: new Date(now.getTime() + SLOT_OFFER_MIN_LEAD_MS + 1),
    });

    let created = 0;
    for (const instructorId of instructors) {
      const own = gaps.filter((gap) => gap.instructorMembershipId === instructorId);
      if (own.length === 0) continue;
      await this.offers.lockInstructor(instructorId);
      let open = await this.offers.countOpen(instructorId, 'gap', now);
      for (const gap of own) {
        if (open >= GAP_OFFERS_PER_INSTRUCTOR) break;
        if (await this.offers.hasOpenOverlapping(instructorId, gap, now)) continue;
        if (await this.offerGap(gap, types, now)) {
          open += 1;
          created += 1;
        }
      }
    }
    return { created };
  }

  private offerableTypes(): Promise<LessonTypeRow[]> {
    return this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(and(eq(lessonTypes.active, true), eq(lessonTypes.kind, 'lesson')))
      .orderBy(asc(lessonTypes.minutes), asc(lessonTypes.name), asc(lessonTypes.id));
  }

  private async offerGap(
    gap: InstructorPeriod,
    types: readonly LessonTypeRow[],
    now: Date,
  ): Promise<CreatedSlotOffer | null> {
    const length = gap.end.getTime() - gap.start.getTime();
    for (const type of types) {
      if (type.minutes * MINUTE > length) break;
      const period = {
        start: gap.start,
        end: new Date(gap.start.getTime() + type.minutes * MINUTE),
      };
      const vehicleId = type.requiresVehicle ? await this.freeVehicle(type, period) : null;
      if (type.requiresVehicle && !vehicleId) continue;
      const offer = await this.creator.createIfStillValid({
        instructorMembershipId: gap.instructorMembershipId,
        vehicleId,
        lessonTypeId: type.id,
        start: gap.start,
        source: 'gap',
        now,
      });
      if (offer) return offer;
    }
    return null;
  }

  private async freeVehicle(type: LessonTypeRow, period: Period): Promise<string | null> {
    const cars = (await this.school.vehicles(true))
      .filter((vehicle) => vehicle.licenceClass === type.licenceClass)
      .sort((a, b) => a.plate.localeCompare(b.plate));
    const busy = await this.lessons.busyByVehicle(
      cars.map((car) => car.id),
      period,
    );
    return (
      cars.find((car) => !(busy.get(car.id) ?? []).some((other) => overlaps(other, period)))?.id ??
      null
    );
  }
}

function clip(window: InstructorPeriod, range: Period): InstructorPeriod[] {
  const start = window.start > range.start ? window.start : range.start;
  const end = window.end < range.end ? window.end : range.end;
  return start < end ? [{ instructorMembershipId: window.instructorMembershipId, start, end }] : [];
}

import type { FreeSlotsResponse } from '@driveos/shared';
import { and, eq } from 'drizzle-orm';
import type { Principal } from '../../../kernel/auth/principal.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { listFreeSlots } from '../domain/free-slots.js';
import { SchedulingAccess } from '../infra/access.js';
import { LessonRecords } from '../infra/lesson-records.js';
import { LessonViews } from '../infra/lesson-views.js';
import { boundedRange } from '../infra/ranges.js';
import { ScheduleWindowsReader } from '../infra/schedule-windows.js';
import { lessonTypes } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { ListFreeSlotsQuery } from './list-free-slots.query.js';

export const FREE_SLOTS_MAX_DAYS = 14;

@QueryHandler(ListFreeSlotsQuery)
export class ListFreeSlotsHandler implements IQueryHandler<ListFreeSlotsQuery, FreeSlotsResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly lessons: LessonRecords,
    private readonly views: LessonViews,
    private readonly windows: ScheduleWindowsReader,
    private readonly school: SchoolFacts,
  ) {}

  async execute({ actor, params }: ListFreeSlotsQuery): Promise<FreeSlotsResponse> {
    const requested = boundedRange(params.from, params.to, FREE_SLOTS_MAX_DAYS);
    const [type] = await this.tenant.tx
      .select()
      .from(lessonTypes)
      .where(and(eq(lessonTypes.id, params.lessonTypeId), eq(lessonTypes.active, true)));
    if (!type) throw notFound();

    const now = new Date();
    const range = { start: requested.start > now ? requested.start : now, end: requested.end };
    if (range.start >= range.end) return { items: [] };
    const instructors = (await this.instructorsFor(actor)).filter(
      (id) => !params.instructorId || id === params.instructorId,
    );
    if (instructors.length === 0) return { items: [] };

    const [zone, settings] = await Promise.all([this.school.timeZone(), this.school.settings()]);
    const { availability } = await this.windows.read(instructors, range, zone);
    const instructorBusy = await this.lessons.busyByInstructor(instructors, range);
    let vehicles: { id: string; busy: { start: Date; end: Date }[] }[] | undefined;
    if (type.requiresVehicle) {
      const cars = (await this.school.vehicles(true))
        .filter((vehicle) => vehicle.licenceClass === type.licenceClass)
        .sort((a, b) => a.plate.localeCompare(b.plate));
      const busy = await this.lessons.busyByVehicle(
        cars.map((car) => car.id),
        range,
      );
      vehicles = cars.map((car) => ({ id: car.id, busy: busy.get(car.id) ?? [] }));
    }
    const slots = listFreeSlots({
      windows: availability,
      instructorBusy,
      minutes: type.minutes,
      minGapMinutes: settings.minGapMinutes,
      notBefore: now,
      vehicles,
    });
    const names = await this.views.instructorNames();
    return {
      items: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        instructorMembershipId: slot.instructorMembershipId,
        instructorName: names.get(slot.instructorMembershipId) ?? '',
        vehicleId: slot.vehicleId,
      })),
    };
  }

  private async instructorsFor(actor: Principal): Promise<string[]> {
    if (await this.access.holdsAny(actor, ['calendar.read', 'lessons.create'])) {
      return this.viewer.activeInstructorIds();
    }
    return this.viewer.bookableInstructorIds(actor);
  }
}

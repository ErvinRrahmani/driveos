import type { CalendarResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import type { Period } from '../domain/period.js';
import { SchedulingAccess } from '../infra/access.js';
import { type LessonScope, LessonRecords } from '../infra/lesson-records.js';
import { LessonViews } from '../infra/lesson-views.js';
import { boundedRange, decodeCalendarCursor, encodeCalendarCursor } from '../infra/ranges.js';
import { ScheduleWindowsReader } from '../infra/schedule-windows.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { GetCalendarQuery } from './get-calendar.query.js';

export const CALENDAR_MAX_DAYS = 62;

@QueryHandler(GetCalendarQuery)
export class GetCalendarHandler implements IQueryHandler<GetCalendarQuery, CalendarResponse> {
  constructor(
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly lessons: LessonRecords,
    private readonly views: LessonViews,
    private readonly windows: ScheduleWindowsReader,
    private readonly school: SchoolFacts,
  ) {}

  async execute({ actor, params }: GetCalendarQuery): Promise<CalendarResponse> {
    const range = boundedRange(params.from, params.to, CALENDAR_MAX_DAYS);
    const scope = await this.scopeOf(actor);
    const rows = await this.lessons.calendarPage({
      range,
      scope,
      instructorId: params.instructorId,
      vehicleId: params.vehicleId,
      studentId: params.studentId,
      after: decodeCalendarCursor(params.cursor),
      limit: params.limit,
    });
    const page = rows.slice(0, params.limit);
    const last = page.at(-1);
    const shaded = await this.shading(scope, params.instructorId, range);
    return {
      items: await this.views.toResponses(page),
      nextCursor:
        rows.length > params.limit && last
          ? encodeCalendarCursor(last.period.start, last.id)
          : null,
      availability: shaded.availability.map((window) => ({
        instructorMembershipId: window.instructorMembershipId,
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      })),
      timeOff: shaded.timeOff.map((off) => ({
        id: off.id,
        instructorMembershipId: off.instructorMembershipId,
        start: off.start.toISOString(),
        end: off.end.toISOString(),
      })),
    };
  }

  private async scopeOf(actor: Principal): Promise<'all' | LessonScope> {
    if (await this.access.holdsAny(actor, ['calendar.read'])) return 'all';
    const ownInstructor =
      actor.roles.includes('instructor') &&
      actor.membershipId !== null &&
      (await this.access.holdsAny(actor, ['calendar.read.own']));
    return {
      instructorIds: ownInstructor && actor.membershipId ? [actor.membershipId] : [],
      studentIds: await this.viewer.ownStudentIds(actor),
    };
  }

  private async shading(
    scope: 'all' | LessonScope,
    instructorId: string | undefined,
    range: Period,
  ) {
    const zone = await this.school.timeZone();
    let instructors: string[];
    if (scope === 'all') {
      instructors = instructorId
        ? [instructorId]
        : await this.windows.instructorsWithAvailability(range, zone);
    } else {
      instructors = scope.instructorIds.filter((id) => !instructorId || id === instructorId);
    }
    return this.windows.read(instructors, range, zone);
  }
}

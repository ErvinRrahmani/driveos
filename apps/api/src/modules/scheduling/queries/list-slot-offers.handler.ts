import type { SlotOfferListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { SchedulingAccess } from '../infra/access.js';
import { LessonViews } from '../infra/lesson-views.js';
import { decodeCalendarCursor, encodeCalendarCursor } from '../infra/ranges.js';
import { SlotOfferRecords } from '../infra/slot-offer-records.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { ListSlotOffersQuery } from './list-slot-offers.query.js';

@QueryHandler(ListSlotOffersQuery)
export class ListSlotOffersHandler implements IQueryHandler<
  ListSlotOffersQuery,
  SlotOfferListResponse
> {
  constructor(
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly records: SlotOfferRecords,
    private readonly views: LessonViews,
  ) {}

  async execute({ actor, params }: ListSlotOffersQuery): Promise<SlotOfferListResponse> {
    const staff = await this.access.holdsAny(actor, ['slot_offers.manage']);
    const rows = await this.records.page({
      offeredTo: staff ? 'all' : await this.viewer.ownStudentIds(actor),
      status: staff ? params.status : (params.status ?? 'open'),
      openOnlyIfUnexpired: !staff,
      after: decodeCalendarCursor(params.cursor),
      limit: params.limit,
    });
    const items = rows.slice(0, params.limit);
    const last = items.at(-1);
    const instructors = items.length > 0 ? await this.views.instructorNames() : new Map();
    return {
      items: items.map((row) => ({
        id: row.id,
        instructorMembershipId: row.instructorMembershipId,
        instructorName: instructors.get(row.instructorMembershipId) ?? '',
        vehicleId: row.vehicleId,
        lessonTypeId: row.lessonTypeId,
        lessonTypeName: row.lessonTypeName,
        creditMinutes: row.creditMinutes,
        start: row.period.start.toISOString(),
        end: row.period.end.toISOString(),
        source: row.source,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
      })),
      nextCursor:
        rows.length > params.limit && last
          ? encodeCalendarCursor(last.period.start, last.id)
          : null,
    };
  }
}

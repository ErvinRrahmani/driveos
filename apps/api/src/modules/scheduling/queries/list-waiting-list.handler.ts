import type { WaitingListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { ListStudentNamesQuery } from '../../training/index.js';
import { SchedulingAccess } from '../infra/access.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { WaitingListRecords } from '../infra/waiting-list-records.js';
import { ListWaitingListQuery } from './list-waiting-list.query.js';

@QueryHandler(ListWaitingListQuery)
export class ListWaitingListHandler implements IQueryHandler<
  ListWaitingListQuery,
  WaitingListResponse
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly records: WaitingListRecords,
  ) {}

  async execute({ actor, params }: ListWaitingListQuery): Promise<WaitingListResponse> {
    const staff = await this.access.holdsAny(actor, ['waiting_list.manage']);
    const rows = await this.records.page({
      studentIds: staff ? 'all' : await this.viewer.ownStudentIds(actor),
      studentId: params.studentId,
      lessonTypeId: params.lessonTypeId,
      active: params.active === undefined ? undefined : params.active === 'true',
      after: idCursor(params.cursor),
      limit: params.limit,
    });
    const page = pageOf(rows, params.limit, (row) => row.id);
    const names = await this.queryBus.execute(
      new ListStudentNamesQuery(page.items.map((row) => row.studentId)),
    );
    const nameOf = new Map(names.map((name) => [name.studentId, name.fullName]));
    return {
      items: page.items.map((row) => ({
        id: row.id,
        studentId: row.studentId,
        studentName: nameOf.get(row.studentId) ?? '',
        lessonTypeId: row.lessonTypeId,
        preferredWindows: row.preferredWindows,
        area: row.area,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}

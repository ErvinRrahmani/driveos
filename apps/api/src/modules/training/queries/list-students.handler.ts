import type { StudentListResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentListRows } from '../infra/student-list.js';
import { ListStudentsQuery } from './list-students.query.js';

@QueryHandler(ListStudentsQuery)
export class ListStudentsHandler implements IQueryHandler<ListStudentsQuery, StudentListResponse> {
  constructor(
    private readonly access: StudentAccess,
    private readonly list: StudentListRows,
  ) {}

  async execute({ actor, params }: ListStudentsQuery): Promise<StudentListResponse> {
    return this.list.list(params, await this.access.visibleIds(actor));
  }
}

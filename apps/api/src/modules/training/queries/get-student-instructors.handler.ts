import type { StudentInstructorsResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { StudentViews } from '../infra/student-views.js';
import { GetStudentInstructorsQuery } from './get-student-instructors.query.js';

@QueryHandler(GetStudentInstructorsQuery)
export class GetStudentInstructorsHandler implements IQueryHandler<
  GetStudentInstructorsQuery,
  StudentInstructorsResponse
> {
  constructor(
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly views: StudentViews,
  ) {}

  async execute({ actor, studentId }: GetStudentInstructorsQuery) {
    await this.access.require(actor, studentId);
    if (!(await this.records.find(studentId))) throw notFound();
    return { items: await this.views.instructors(studentId) };
  }
}

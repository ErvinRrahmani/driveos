import { inArray } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { students } from '../infra/schema.js';
import { ListStudentNamesQuery, type StudentName } from './list-student-names.query.js';

@QueryHandler(ListStudentNamesQuery)
export class ListStudentNamesHandler implements IQueryHandler<
  ListStudentNamesQuery,
  StudentName[]
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ studentIds }: ListStudentNamesQuery): Promise<StudentName[]> {
    if (studentIds.length === 0) return [];
    return this.tenant.tx
      .select({ studentId: students.id, fullName: students.fullName })
      .from(students)
      .where(inArray(students.id, [...new Set(studentIds)]));
  }
}

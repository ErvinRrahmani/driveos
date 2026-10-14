import type { StudentResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { StudentViews } from '../infra/student-views.js';
import { GetStudentQuery } from './get-student.query.js';

@QueryHandler(GetStudentQuery)
export class GetStudentHandler implements IQueryHandler<GetStudentQuery, StudentResponse> {
  constructor(
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly views: StudentViews,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, studentId }: GetStudentQuery): Promise<StudentResponse> {
    const { staffRead } = await this.access.require(actor, studentId);
    const student = await this.records.find(studentId);
    if (!student) throw notFound();
    if (staffRead) {
      await this.audit.record({
        action: 'student.read',
        targetType: 'student',
        targetId: studentId,
      });
    }
    return this.views.detail(student);
  }
}

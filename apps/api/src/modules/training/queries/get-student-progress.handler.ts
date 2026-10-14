import type { StudentProgressResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { ProgressRecords } from '../infra/progress-records.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { GetStudentProgressQuery } from './get-student-progress.query.js';

@QueryHandler(GetStudentProgressQuery)
export class GetStudentProgressHandler implements IQueryHandler<
  GetStudentProgressQuery,
  StudentProgressResponse
> {
  constructor(
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly progress: ProgressRecords,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, studentId }: GetStudentProgressQuery): Promise<StudentProgressResponse> {
    const { staffRead } = await this.access.require(actor, studentId);
    const student = await this.records.find(studentId);
    if (!student) throw notFound();
    if (staffRead) {
      await this.audit.record({
        action: 'student.progress.read',
        targetType: 'student',
        targetId: studentId,
      });
    }
    return this.progress.progress(student);
  }
}

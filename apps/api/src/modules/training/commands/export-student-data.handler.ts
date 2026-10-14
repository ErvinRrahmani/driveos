import type { StudentExportResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentExport } from '../infra/student-export.js';
import { StudentRecords } from '../infra/student-records.js';
import { ExportStudentDataCommand } from './export-student-data.command.js';

@CommandHandler(ExportStudentDataCommand)
export class ExportStudentDataHandler implements ICommandHandler<
  ExportStudentDataCommand,
  StudentExportResponse
> {
  constructor(
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly exporter: StudentExport,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, studentId }: ExportStudentDataCommand): Promise<StudentExportResponse> {
    await this.access.require(actor, studentId);
    const student = await this.records.find(studentId);
    if (!student) throw notFound();
    const bundle = await this.exporter.bundle(actor, student);
    await this.audit.record({
      action: 'student.export',
      targetType: 'student',
      targetId: studentId,
    });
    return { bundle, pdfBase64: Buffer.from(this.exporter.pdf(bundle)).toString('base64') };
  }
}

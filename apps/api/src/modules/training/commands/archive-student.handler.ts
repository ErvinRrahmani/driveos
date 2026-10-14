import { StudentArchived } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { StudentStream } from '../events/student-stream.js';
import { Assignments } from '../infra/assignments.js';
import { SchedulingFacts } from '../infra/scheduling-facts.js';
import { enrolments, students } from '../infra/schema.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentRecords } from '../infra/student-records.js';
import { ArchiveStudentCommand } from './archive-student.command.js';

@CommandHandler(ArchiveStudentCommand)
export class ArchiveStudentHandler implements ICommandHandler<
  ArchiveStudentCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly assignments: Assignments,
    private readonly scheduling: SchedulingFacts,
    private readonly publisher: EventPublisher,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly list: StudentListRows,
  ) {}

  async execute({ studentId, body }: ArchiveStudentCommand): Promise<CommandResult> {
    const student = await this.records.lockActive(studentId);
    const now = new Date();
    const stream = new StudentStream(studentId, student.version);
    await this.tenant.tx
      .update(enrolments)
      .set({ endedAt: now })
      .where(and(eq(enrolments.studentId, studentId), isNull(enrolments.endedAt)));
    await this.assignments.unassign(stream, await this.records.activeAssignments(studentId), now);
    stream.add(StudentArchived, {
      studentId,
      archivedAt: now.toISOString(),
      completedLessons: await this.scheduling.completedLessons(studentId),
    });
    await this.tenant.tx
      .update(students)
      .set({ status: 'archived', version: stream.version })
      .where(eq(students.id, studentId));
    await this.publisher.append(stream.events);
    await this.list.refresh(studentId);
    await this.audit.record({
      action: 'student.archive',
      targetType: 'student',
      targetId: studentId,
      reason: body.reason,
    });
    return { id: studentId, version: stream.version };
  }
}

import { StudentAnonymized } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  CommandBus,
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AnonymizeUserCommand } from '../../identity/index.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { anonymizedStudentFields } from '../domain/anonymization.js';
import { StudentStream } from '../events/student-stream.js';
import { Assignments } from '../infra/assignments.js';
import {
  enrolments,
  guardianLinks,
  privateNotes,
  progressEntries,
  students,
  testAttempts,
} from '../infra/schema.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentRecords } from '../infra/student-records.js';
import { AnonymizeStudentCommand } from './anonymize-student.command.js';

@CommandHandler(AnonymizeStudentCommand)
export class AnonymizeStudentHandler implements ICommandHandler<
  AnonymizeStudentCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly assignments: Assignments,
    private readonly list: StudentListRows,
    private readonly commandBus: CommandBus,
    private readonly publisher: EventPublisher,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ studentId }: AnonymizeStudentCommand): Promise<CommandResult> {
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') return { id: studentId, version: student.version };
    const now = new Date();
    const tx = this.tenant.tx;
    const stream = new StudentStream(studentId, student.version);
    await tx
      .update(enrolments)
      .set({ endedAt: now })
      .where(and(eq(enrolments.studentId, studentId), isNull(enrolments.endedAt)));
    await this.assignments.unassign(stream, await this.records.activeAssignments(studentId), now);
    await tx
      .update(guardianLinks)
      .set({ revokedAt: now, version: sql`${guardianLinks.version} + 1` })
      .where(and(eq(guardianLinks.studentId, studentId), isNull(guardianLinks.revokedAt)));
    await tx.delete(privateNotes).where(eq(privateNotes.studentId, studentId));
    await tx
      .update(progressEntries)
      .set({ note: '', version: sql`${progressEntries.version} + 1` })
      .where(and(eq(progressEntries.studentId, studentId), sql`${progressEntries.note} <> ''`));
    await tx
      .update(testAttempts)
      .set({ notes: '', version: sql`${testAttempts.version} + 1` })
      .where(and(eq(testAttempts.studentId, studentId), sql`${testAttempts.notes} <> ''`));
    const userAnonymized = student.userId
      ? (await this.commandBus.execute(new AnonymizeUserCommand(student.userId))).userAnonymized
      : false;
    stream.add(StudentAnonymized, {
      studentId,
      userId: student.userId,
      userAnonymized,
      anonymizedAt: now.toISOString(),
    });
    await tx
      .update(students)
      .set({ ...anonymizedStudentFields(), version: stream.version })
      .where(eq(students.id, studentId));
    await this.publisher.append(stream.events);
    await this.list.refresh(studentId);
    await this.audit.record({
      action: 'student.anonymize',
      targetType: 'student',
      targetId: studentId,
    });
    return { id: studentId, version: stream.version };
  }
}

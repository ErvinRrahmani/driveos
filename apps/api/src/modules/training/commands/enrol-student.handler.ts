import { StudentEnrolled } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { enrolments } from '../infra/schema.js';
import { StudentRecords } from '../infra/student-records.js';
import { EnrolStudentCommand } from './enrol-student.command.js';

@CommandHandler(EnrolStudentCommand)
export class EnrolStudentHandler implements ICommandHandler<EnrolStudentCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ studentId, body }: EnrolStudentCommand): Promise<CommandResult> {
    const student = await this.records.lockActive(studentId);
    const earlier = await this.tenant.tx
      .select({ id: enrolments.id })
      .from(enrolments)
      .where(eq(enrolments.studentId, studentId))
      .limit(1);
    const id = newId();
    const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
    await this.tenant.tx.insert(enrolments).values({
      id,
      schoolId: student.schoolId,
      studentId,
      courseName: body.courseName,
      licenceClass: body.licenceClass,
      startedAt,
    });
    const stream = new StudentStream(studentId, student.version);
    stream.add(StudentEnrolled, {
      studentId,
      enrolmentId: id,
      courseName: body.courseName,
      licenceClass: body.licenceClass,
      firstEnrolment: earlier.length === 0,
      startedAt: startedAt.toISOString(),
    });
    await this.records.setVersion(studentId, stream.version);
    await this.publisher.append(stream.events);
    return { id, version: 1 };
  }
}

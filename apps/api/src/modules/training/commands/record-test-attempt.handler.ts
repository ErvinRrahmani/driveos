import { TestAttemptRecorded } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { testAttempts } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { studentNotActive } from '../infra/training-errors.js';
import { RecordTestAttemptCommand } from './record-test-attempt.command.js';

@CommandHandler(RecordTestAttemptCommand)
export class RecordTestAttemptHandler implements ICommandHandler<
  RecordTestAttemptCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, studentId, body }: RecordTestAttemptCommand): Promise<CommandResult> {
    await this.access.requireTeaching(actor, studentId);
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') throw studentNotActive();
    const id = newId();
    await this.tenant.tx.insert(testAttempts).values({
      id,
      schoolId: student.schoolId,
      studentId,
      kind: body.kind,
      takenOn: body.takenOn,
      result: body.result,
      notes: body.notes,
    });
    const stream = new StudentStream(studentId, student.version);
    stream.add(TestAttemptRecorded, {
      testAttemptId: id,
      studentId,
      kind: body.kind,
      takenOn: body.takenOn,
      result: body.result,
    });
    await this.records.setVersion(studentId, stream.version);
    await this.publisher.append(stream.events);
    return { id, version: 1 };
  }
}

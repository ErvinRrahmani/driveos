import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { students } from '../infra/schema.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentRecords } from '../infra/student-records.js';
import { studentNotActive } from '../infra/training-errors.js';
import { UpdateStudentCommand } from './update-student.command.js';

@CommandHandler(UpdateStudentCommand)
export class UpdateStudentHandler implements ICommandHandler<UpdateStudentCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly list: StudentListRows,
  ) {}

  async execute({ studentId, patch }: UpdateStudentCommand): Promise<CommandResult> {
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') throw studentNotActive();
    const version = student.version + 1;
    await this.tenant.tx
      .update(students)
      .set({ ...patch, version })
      .where(eq(students.id, studentId));
    await this.list.refresh(studentId);
    return { id: studentId, version };
  }
}

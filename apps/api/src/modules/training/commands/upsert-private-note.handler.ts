import { sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchedulingFacts } from '../infra/scheduling-facts.js';
import { privateNotes } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { studentNotActive } from '../infra/training-errors.js';
import { UpsertPrivateNoteCommand } from './upsert-private-note.command.js';

@CommandHandler(UpsertPrivateNoteCommand)
export class UpsertPrivateNoteHandler implements ICommandHandler<
  UpsertPrivateNoteCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly scheduling: SchedulingFacts,
  ) {}

  async execute({ actor, input }: UpsertPrivateNoteCommand): Promise<CommandResult> {
    const { lessonId, studentId, body } = input;
    const author = actor.membershipId;
    if (!author) throw notFound();
    await this.access.requireTeaching(actor, studentId);
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') throw studentNotActive();
    await this.scheduling.lessonOfStudent(lessonId, studentId);
    const [row] = await this.tenant.tx
      .insert(privateNotes)
      .values({
        id: input.noteId ?? newId(),
        schoolId: student.schoolId,
        lessonId,
        studentId,
        authorMembershipId: author,
        body,
        version: 1,
      })
      .onConflictDoUpdate({
        target: [privateNotes.lessonId, privateNotes.studentId, privateNotes.authorMembershipId],
        set: { body, version: sql`${privateNotes.version} + 1`, updatedAt: sql`now()` },
      })
      .returning({ id: privateNotes.id, version: privateNotes.version });
    if (!row) throw notFound();
    return row;
  }
}

import type { StudentInstructorsResponse } from '@driveos/shared';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { hasOnePrimary, planAssignments } from '../domain/assignments.js';
import { StudentStream } from '../events/student-stream.js';
import { Assignments } from '../infra/assignments.js';
import { People } from '../infra/people.js';
import { StudentRecords } from '../infra/student-records.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentViews } from '../infra/student-views.js';
import { ReplaceStudentInstructorsCommand } from './replace-student-instructors.command.js';

@CommandHandler(ReplaceStudentInstructorsCommand)
export class ReplaceStudentInstructorsHandler implements ICommandHandler<
  ReplaceStudentInstructorsCommand,
  StudentInstructorsResponse
> {
  constructor(
    private readonly records: StudentRecords,
    private readonly assignments: Assignments,
    private readonly people: People,
    private readonly views: StudentViews,
    private readonly publisher: EventPublisher,
    private readonly list: StudentListRows,
  ) {}

  async execute({
    studentId,
    body,
  }: ReplaceStudentInstructorsCommand): Promise<StudentInstructorsResponse> {
    const student = await this.records.lockActive(studentId);
    if (!hasOnePrimary(body.instructors)) {
      throw invalidField(['instructors'], 'Exactly one primary instructor');
    }
    for (const [index, row] of body.instructors.entries()) {
      if (!(await this.people.isInstructor(row.instructorMembershipId))) {
        throw invalidField(
          ['instructors', index, 'instructorMembershipId'],
          'Not an instructor of this school',
        );
      }
    }
    const current = await this.records.activeAssignments(studentId);
    const plan = planAssignments(
      current.map((row) => ({
        assignmentId: row.id,
        instructorMembershipId: row.instructorMembershipId,
        isPrimary: row.isPrimary,
      })),
      body.instructors,
    );
    const stream = new StudentStream(studentId, student.version);
    await this.assignments.apply(stream, current, plan, new Date());
    if (stream.events.length > 0) {
      await this.records.setVersion(studentId, stream.version);
      await this.publisher.append(stream.events);
    }
    await this.list.refresh(studentId);
    return { items: await this.views.instructors(studentId) };
  }
}

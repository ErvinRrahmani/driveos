import { InstructorAssigned, StudentCreated, StudentEnrolled } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { People } from '../infra/people.js';
import { enrolments, studentInstructors, students } from '../infra/schema.js';
import { StudentListRows } from '../infra/student-list.js';
import { StudentRecords } from '../infra/student-records.js';
import { CreateStudentCommand } from './create-student.command.js';

@CommandHandler(CreateStudentCommand)
export class CreateStudentHandler implements ICommandHandler<CreateStudentCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly people: People,
    private readonly records: StudentRecords,
    private readonly publisher: EventPublisher,
    private readonly list: StudentListRows,
  ) {}

  async execute({ body }: CreateStudentCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Creating a student needs a school scope');
    const { primaryInstructorMembershipId, enrolment, ...fields } = body;
    if (
      primaryInstructorMembershipId &&
      !(await this.people.isInstructor(primaryInstructorMembershipId))
    ) {
      throw invalidField(['primaryInstructorMembershipId'], 'Not an instructor of this school');
    }
    const id = newId();
    const now = new Date();
    const stream = new StudentStream(id, 0);
    stream.add(StudentCreated, {
      studentId: id,
      userId: null,
      fullName: fields.fullName,
      licenceClass: fields.licenceClass,
      examLanguage: fields.examLanguage,
      testDate: fields.testDate ?? null,
      area: fields.area ?? null,
      status: 'active',
    });
    await this.tenant.tx.insert(students).values({ ...fields, id, schoolId, status: 'active' });
    if (primaryInstructorMembershipId) {
      const assignmentId = newId();
      await this.tenant.tx.insert(studentInstructors).values({
        id: assignmentId,
        schoolId,
        studentId: id,
        instructorMembershipId: primaryInstructorMembershipId,
        isPrimary: true,
        assignedAt: now,
      });
      const names = await this.people.staffNames();
      stream.add(InstructorAssigned, {
        assignmentId,
        studentId: id,
        instructorMembershipId: primaryInstructorMembershipId,
        instructorName: names.get(primaryInstructorMembershipId) ?? '',
        isPrimary: true,
        assignedAt: now.toISOString(),
      });
    }
    if (enrolment) {
      const enrolmentId = newId();
      await this.tenant.tx.insert(enrolments).values({
        id: enrolmentId,
        schoolId,
        studentId: id,
        courseName: enrolment.courseName,
        licenceClass: enrolment.licenceClass,
        startedAt: now,
      });
      stream.add(StudentEnrolled, {
        studentId: id,
        enrolmentId,
        courseName: enrolment.courseName,
        licenceClass: enrolment.licenceClass,
        firstEnrolment: true,
        startedAt: now.toISOString(),
      });
    }
    await this.records.setVersion(id, stream.version);
    await this.publisher.append(stream.events);
    await this.list.refresh(id);
    return { id, version: stream.version };
  }
}

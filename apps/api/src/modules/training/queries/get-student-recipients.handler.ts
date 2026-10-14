import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { Relations } from '../infra/relations.js';
import { StudentRecords } from '../infra/student-records.js';
import {
  GetStudentRecipientsQuery,
  type StudentRecipients,
} from './get-student-recipients.query.js';

@QueryHandler(GetStudentRecipientsQuery)
export class GetStudentRecipientsHandler implements IQueryHandler<
  GetStudentRecipientsQuery,
  StudentRecipients | null
> {
  constructor(
    private readonly records: StudentRecords,
    private readonly relations: Relations,
  ) {}

  async execute({ studentId }: GetStudentRecipientsQuery): Promise<StudentRecipients | null> {
    const student = await this.records.find(studentId);
    if (!student) return null;
    return {
      studentId,
      studentUserId: student.userId,
      guardianUserIds: await this.relations.consentedGuardiansOf(studentId),
    };
  }
}

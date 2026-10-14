import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { isMinor, utcToday } from '../domain/minor.js';
import { MinorStatus } from '../infra/minor-status.js';
import { Relations } from '../infra/relations.js';
import { StudentRecords } from '../infra/student-records.js';
import {
  GetStudentMinorStatusQuery,
  type StudentMinorStatus,
} from './get-student-minor-status.query.js';

@QueryHandler(GetStudentMinorStatusQuery)
export class GetStudentMinorStatusHandler implements IQueryHandler<
  GetStudentMinorStatusQuery,
  StudentMinorStatus | null
> {
  constructor(
    private readonly records: StudentRecords,
    private readonly relations: Relations,
    private readonly minors: MinorStatus,
  ) {}

  async execute({ studentId }: GetStudentMinorStatusQuery): Promise<StudentMinorStatus | null> {
    const student = await this.records.find(studentId);
    if (!student) return null;
    const ageOfMajority = await this.minors.ageOfMajority();
    return {
      studentId,
      dateOfBirth: student.dateOfBirth,
      ageOfMajority,
      isMinor: isMinor(student.dateOfBirth, ageOfMajority, utcToday(new Date())),
      hasGuardianConsent: (await this.relations.consentedGuardiansOf(studentId)).length > 0,
    };
  }
}

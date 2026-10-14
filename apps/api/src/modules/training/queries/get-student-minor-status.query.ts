import { Query } from '../../../kernel/cqrs/index.js';

export interface StudentMinorStatus {
  studentId: string;
  dateOfBirth: string;
  ageOfMajority: number;
  isMinor: boolean;
  hasGuardianConsent: boolean;
}

export class GetStudentMinorStatusQuery extends Query<StudentMinorStatus | null> {
  constructor(readonly studentId: string) {
    super();
  }
}

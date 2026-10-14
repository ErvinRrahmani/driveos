import { Query } from '../../../kernel/cqrs/index.js';

export interface StudentName {
  studentId: string;
  fullName: string;
}

export class ListStudentNamesQuery extends Query<StudentName[]> {
  constructor(readonly studentIds: readonly string[]) {
    super();
  }
}

import { Query } from '../../../kernel/cqrs/index.js';

export interface StudentRecipients {
  studentId: string;
  studentUserId: string | null;
  guardianUserIds: string[];
}

export class GetStudentRecipientsQuery extends Query<StudentRecipients | null> {
  constructor(readonly studentId: string) {
    super();
  }
}

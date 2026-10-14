import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { GetStudentRecipientsQuery } from '../../training/index.js';

@Injectable()
export class StudentAudience {
  constructor(private readonly queryBus: QueryBus) {}

  async userIdsOf(studentId: string): Promise<string[]> {
    const recipients = await this.queryBus.execute(new GetStudentRecipientsQuery(studentId));
    if (!recipients) return [];
    return [
      ...new Set(
        [recipients.studentUserId, ...recipients.guardianUserIds].filter(
          (id): id is string => id !== null,
        ),
      ),
    ];
  }
}

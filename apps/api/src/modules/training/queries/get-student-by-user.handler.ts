import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { StudentRecords } from '../infra/student-records.js';
import type { StudentBookingProfile } from './get-student-booking-profile.query.js';
import { GetStudentByUserQuery } from './get-student-by-user.query.js';

@QueryHandler(GetStudentByUserQuery)
export class GetStudentByUserHandler implements IQueryHandler<
  GetStudentByUserQuery,
  StudentBookingProfile | null
> {
  constructor(private readonly records: StudentRecords) {}

  execute({ userId }: GetStudentByUserQuery): Promise<StudentBookingProfile | null> {
    return this.records.profileOfUser(userId);
  }
}

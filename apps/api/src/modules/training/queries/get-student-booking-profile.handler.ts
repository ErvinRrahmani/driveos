import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { StudentRecords } from '../infra/student-records.js';
import {
  GetStudentBookingProfileQuery,
  type StudentBookingProfile,
} from './get-student-booking-profile.query.js';

@QueryHandler(GetStudentBookingProfileQuery)
export class GetStudentBookingProfileHandler implements IQueryHandler<
  GetStudentBookingProfileQuery,
  StudentBookingProfile | null
> {
  constructor(private readonly records: StudentRecords) {}

  execute({ studentId }: GetStudentBookingProfileQuery): Promise<StudentBookingProfile | null> {
    return this.records.profile(studentId);
  }
}

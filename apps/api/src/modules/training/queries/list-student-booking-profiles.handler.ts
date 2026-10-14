import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { StudentRecords } from '../infra/student-records.js';
import type { StudentBookingProfile } from './get-student-booking-profile.query.js';
import { ListStudentBookingProfilesQuery } from './list-student-booking-profiles.query.js';

@QueryHandler(ListStudentBookingProfilesQuery)
export class ListStudentBookingProfilesHandler implements IQueryHandler<
  ListStudentBookingProfilesQuery,
  StudentBookingProfile[]
> {
  constructor(private readonly records: StudentRecords) {}

  execute({ filter }: ListStudentBookingProfilesQuery): Promise<StudentBookingProfile[]> {
    return this.records.profiles(filter);
  }
}

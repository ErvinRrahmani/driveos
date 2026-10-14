import { Query } from '../../../kernel/cqrs/index.js';
import type { StudentBookingProfile } from './get-student-booking-profile.query.js';

export interface StudentBookingProfileFilter {
  studentIds?: readonly string[];
  area?: string;
  licenceClass?: string;
  activeOnly?: boolean;
}

export class ListStudentBookingProfilesQuery extends Query<StudentBookingProfile[]> {
  constructor(readonly filter: StudentBookingProfileFilter) {
    super();
  }
}

import { Query } from '../../../kernel/cqrs/index.js';
import type { StudentBookingProfile } from './get-student-booking-profile.query.js';

export class GetStudentByUserQuery extends Query<StudentBookingProfile | null> {
  constructor(readonly userId: string) {
    super();
  }
}

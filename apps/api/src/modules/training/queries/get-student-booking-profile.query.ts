import type { StudentStatus } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export interface StudentBookingProfile {
  studentId: string;
  userId: string | null;
  fullName: string;
  licenceClass: string;
  status: StudentStatus;
  area: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  primaryInstructorMembershipId: string | null;
  allowedInstructorMembershipIds: string[];
}

export class GetStudentBookingProfileQuery extends Query<StudentBookingProfile | null> {
  constructor(readonly studentId: string) {
    super();
  }
}

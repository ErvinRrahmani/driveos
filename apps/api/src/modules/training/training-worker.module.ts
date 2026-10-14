import { Module } from '@nestjs/common';
import { IdentityWorkerModule } from '../identity/identity-worker.module.js';
import { PurgeLeadsHandler } from './commands/purge-leads.handler.js';
import { GuardianLinks } from './infra/guardian-links.js';
import { LeadPurgeJob } from './infra/lead-purge.job.js';
import { LeadRecords } from './infra/lead-records.js';
import { MinorStatus } from './infra/minor-status.js';
import { People } from './infra/people.js';
import { ProgressRecords } from './infra/progress-records.js';
import { Relations } from './infra/relations.js';
import { StudentListRows } from './infra/student-list.js';
import { StudentRecords } from './infra/student-records.js';
import { StudentListProjection } from './projections/student-list.projection.js';
import { GetStudentBookingProfileHandler } from './queries/get-student-booking-profile.handler.js';
import { ListStudentBookingProfilesHandler } from './queries/list-student-booking-profiles.handler.js';
import { GetStudentByUserHandler } from './queries/get-student-by-user.handler.js';
import { GetStudentMinorStatusHandler } from './queries/get-student-minor-status.handler.js';
import { GetStudentRecipientsHandler } from './queries/get-student-recipients.handler.js';
import { ListLinkedStudentIdsHandler } from './queries/list-linked-student-ids.handler.js';
import { ListProgressEntriesHandler } from './queries/list-progress-entries.handler.js';
import { ListStudentIdsForInstructorHandler } from './queries/list-student-ids-for-instructor.handler.js';
import { ListStudentNamesHandler } from './queries/list-student-names.handler.js';
import { MembershipStudentLinkSubscriber } from './subscribers/membership-student-link.subscriber.js';

@Module({
  imports: [IdentityWorkerModule],
  providers: [
    People,
    ProgressRecords,
    StudentListRows,
    StudentListProjection,
    StudentRecords,
    Relations,
    MinorStatus,
    GuardianLinks,
    MembershipStudentLinkSubscriber,
    GetStudentMinorStatusHandler,
    GetStudentBookingProfileHandler,
    ListStudentBookingProfilesHandler,
    GetStudentByUserHandler,
    ListLinkedStudentIdsHandler,
    ListProgressEntriesHandler,
    ListStudentIdsForInstructorHandler,
    GetStudentRecipientsHandler,
    ListStudentNamesHandler,
    LeadRecords,
    PurgeLeadsHandler,
    LeadPurgeJob,
  ],
})
export class TrainingWorkerModule {}

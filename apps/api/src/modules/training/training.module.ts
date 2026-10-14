import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { AnonymizeStudentHandler } from './commands/anonymize-student.handler.js';
import { ArchiveStudentHandler } from './commands/archive-student.handler.js';
import { CreateStudentHandler } from './commands/create-student.handler.js';
import { EnrolStudentHandler } from './commands/enrol-student.handler.js';
import { ExportStudentDataHandler } from './commands/export-student-data.handler.js';
import { GiveGuardianConsentHandler } from './commands/give-guardian-consent.handler.js';
import { LinkGuardianHandler } from './commands/link-guardian.handler.js';
import { RecordProgressHandler } from './commands/record-progress.handler.js';
import { RecordTestAttemptHandler } from './commands/record-test-attempt.handler.js';
import { ReplaceStudentInstructorsHandler } from './commands/replace-student-instructors.handler.js';
import { UpdateStudentHandler } from './commands/update-student.handler.js';
import { UpsertPrivateNoteHandler } from './commands/upsert-private-note.handler.js';
import { GuardianLinksController, GuardiansController } from './http/guardians.controller.js';
import { PrivateNotesController } from './http/private-notes.controller.js';
import { StudentsController } from './http/students.controller.js';
import { SyllabusController } from './http/syllabus.controller.js';
import { Assignments } from './infra/assignments.js';
import { GuardianLinks } from './infra/guardian-links.js';
import { MinorStatus } from './infra/minor-status.js';
import { People } from './infra/people.js';
import { ProgressRecords } from './infra/progress-records.js';
import { Relations } from './infra/relations.js';
import { SchedulingFacts } from './infra/scheduling-facts.js';
import { StudentAccess } from './infra/student-access.js';
import { StudentExport } from './infra/student-export.js';
import { StudentListRows } from './infra/student-list.js';
import { StudentRecords } from './infra/student-records.js';
import { StudentViews } from './infra/student-views.js';
import { GetStudentBookingProfileHandler } from './queries/get-student-booking-profile.handler.js';
import { ListStudentBookingProfilesHandler } from './queries/list-student-booking-profiles.handler.js';
import { GetStudentByUserHandler } from './queries/get-student-by-user.handler.js';
import { GetStudentInstructorsHandler } from './queries/get-student-instructors.handler.js';
import { GetStudentMinorStatusHandler } from './queries/get-student-minor-status.handler.js';
import { GetStudentProgressHandler } from './queries/get-student-progress.handler.js';
import { GetStudentRecipientsHandler } from './queries/get-student-recipients.handler.js';
import { GetStudentHandler } from './queries/get-student.handler.js';
import { GetSyllabusHandler } from './queries/get-syllabus.handler.js';
import { GetTestAttemptStatsHandler } from './queries/get-test-attempt-stats.handler.js';
import { ListLinkedStudentIdsHandler } from './queries/list-linked-student-ids.handler.js';
import { ListProgressEntriesHandler } from './queries/list-progress-entries.handler.js';
import { ListStudentNamesHandler } from './queries/list-student-names.handler.js';
import { ListPrivateNotesHandler } from './queries/list-private-notes.handler.js';
import { ListStudentIdsForInstructorHandler } from './queries/list-student-ids-for-instructor.handler.js';
import { ListMyGuardianLinksHandler } from './queries/list-my-guardian-links.handler.js';
import { ListStudentsHandler } from './queries/list-students.handler.js';

@Module({
  imports: [PlatformModule, IdentityModule],
  controllers: [
    StudentsController,
    GuardiansController,
    GuardianLinksController,
    SyllabusController,
    PrivateNotesController,
  ],
  providers: [
    StudentRecords,
    Relations,
    People,
    MinorStatus,
    SchedulingFacts,
    StudentAccess,
    StudentViews,
    Assignments,
    GuardianLinks,
    ProgressRecords,
    StudentListRows,
    StudentExport,
    CreateStudentHandler,
    UpdateStudentHandler,
    EnrolStudentHandler,
    ArchiveStudentHandler,
    ReplaceStudentInstructorsHandler,
    LinkGuardianHandler,
    GiveGuardianConsentHandler,
    ListStudentsHandler,
    ListMyGuardianLinksHandler,
    GetStudentHandler,
    GetStudentInstructorsHandler,
    GetStudentMinorStatusHandler,
    GetStudentBookingProfileHandler,
    ListStudentBookingProfilesHandler,
    GetStudentByUserHandler,
    ListLinkedStudentIdsHandler,
    ListProgressEntriesHandler,
    ListStudentNamesHandler,
    ListStudentIdsForInstructorHandler,
    GetStudentRecipientsHandler,
    RecordProgressHandler,
    UpsertPrivateNoteHandler,
    RecordTestAttemptHandler,
    GetSyllabusHandler,
    GetStudentProgressHandler,
    GetTestAttemptStatsHandler,
    ListPrivateNotesHandler,
    ExportStudentDataHandler,
    AnonymizeStudentHandler,
  ],
})
export class TrainingModule {}

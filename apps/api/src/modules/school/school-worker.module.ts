import { Module } from '@nestjs/common';
import { DeleteStudentReviewHandler } from './commands/delete-student-review.handler.js';
import { PublicProfileRecords } from './infra/public-profile-records.js';
import { SchoolRecords } from './infra/school-records.js';
import { GetOpeningHoursHandler } from './queries/get-opening-hours.handler.js';
import { GetPublicProfileHandler } from './queries/get-public-profile.handler.js';
import { GetSchoolSettingsHandler } from './queries/get-school-settings.handler.js';
import { GetSchoolHandler } from './queries/get-school.handler.js';
import { ListVehiclesHandler } from './queries/list-vehicles.handler.js';
import { StudentAnonymizedSubscriber } from './subscribers/student-anonymized.subscriber.js';

@Module({
  providers: [
    SchoolRecords,
    PublicProfileRecords,
    GetSchoolSettingsHandler,
    GetSchoolHandler,
    GetOpeningHoursHandler,
    ListVehiclesHandler,
    GetPublicProfileHandler,
    DeleteStudentReviewHandler,
    StudentAnonymizedSubscriber,
  ],
})
export class SchoolWorkerModule {}

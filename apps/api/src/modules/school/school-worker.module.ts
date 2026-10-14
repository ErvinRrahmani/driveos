import { Module } from '@nestjs/common';
import { SchoolRecords } from './infra/school-records.js';
import { GetOpeningHoursHandler } from './queries/get-opening-hours.handler.js';
import { GetSchoolSettingsHandler } from './queries/get-school-settings.handler.js';
import { GetSchoolHandler } from './queries/get-school.handler.js';
import { ListVehiclesHandler } from './queries/list-vehicles.handler.js';

@Module({
  providers: [
    SchoolRecords,
    GetSchoolSettingsHandler,
    GetSchoolHandler,
    GetOpeningHoursHandler,
    ListVehiclesHandler,
  ],
})
export class SchoolWorkerModule {}

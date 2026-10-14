import type { SchoolSettings } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { SchoolRecords } from '../infra/school-records.js';
import { GetSchoolSettingsQuery } from './get-school-settings.query.js';

@QueryHandler(GetSchoolSettingsQuery)
export class GetSchoolSettingsHandler implements IQueryHandler<
  GetSchoolSettingsQuery,
  SchoolSettings
> {
  constructor(private readonly records: SchoolRecords) {}

  execute(): Promise<SchoolSettings> {
    return this.records.settings();
  }
}

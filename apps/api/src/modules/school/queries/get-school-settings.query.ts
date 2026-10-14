import type { SchoolSettings } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetSchoolSettingsQuery extends Query<SchoolSettings> {}

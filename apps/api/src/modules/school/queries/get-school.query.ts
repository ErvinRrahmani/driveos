import type { SchoolResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetSchoolQuery extends Query<SchoolResponse> {}

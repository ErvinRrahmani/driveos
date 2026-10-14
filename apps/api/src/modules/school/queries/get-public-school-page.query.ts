import type { PublicSchoolPage } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

/**
 * The current school's public enrolment page (run in the school's scope without a user, after
 * `ResolvePublicSchoolQuery`). Throws `404 school_not_found` when the profile is not published.
 */
export class GetPublicSchoolPageQuery extends Query<PublicSchoolPage> {}

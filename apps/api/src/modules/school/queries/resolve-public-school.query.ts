import { Query } from '../../../kernel/cqrs/index.js';

/**
 * The school id behind a public page slug. Execute it in a school-less tenant scope
 * (`runInTenant({ schoolId: null, userId: null })`); throws `404 school_not_found` when the slug is
 * unknown or unpublished, the school is not active, or its plan lacks `enrolment_page`.
 */
export class ResolvePublicSchoolQuery extends Query<string> {
  constructor(readonly slug: string) {
    super();
  }
}

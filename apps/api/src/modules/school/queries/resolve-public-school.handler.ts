import { sql } from 'drizzle-orm';
import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolHasFeatureQuery } from '../../platform/index.js';
import { schoolNotFound } from '../infra/public-profile-records.js';
import { ResolvePublicSchoolQuery } from './resolve-public-school.query.js';

@QueryHandler(ResolvePublicSchoolQuery)
export class ResolvePublicSchoolHandler implements IQueryHandler<ResolvePublicSchoolQuery, string> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ slug }: ResolvePublicSchoolQuery): Promise<string> {
    if (this.tenant.schoolId !== null) {
      throw new Error('ResolvePublicSchoolQuery must run in a school-less tenant scope');
    }
    const result = await this.tenant.tx.execute<{ school_id: string | null }>(
      sql`select school_id_for_public_slug(${slug}) as school_id`,
    );
    const schoolId = result.rows[0]?.school_id ?? null;
    if (!schoolId) throw schoolNotFound();
    const hasFeature = await this.tenant.enterSchool(schoolId, () =>
      this.queryBus.execute(new SchoolHasFeatureQuery('enrolment_page')),
    );
    if (!hasFeature) throw schoolNotFound();
    return schoolId;
  }
}

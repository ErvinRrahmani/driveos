import { Injectable } from '@nestjs/common';
import type { PublicSchoolPage } from '@driveos/shared';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetPublicSchoolPageQuery } from '../queries/get-public-school-page.query.js';
import { ResolvePublicSchoolQuery } from '../queries/resolve-public-school.query.js';

/**
 * Public (`@Public()`) routes get no tenant scope from the interceptor. This resolves the school of
 * a slug in a school-less transaction (SECURITY DEFINER `school_id_for_public_slug` + plan feature)
 * and then reads the page in the school's own transaction without a user (SPEC §6.2, design §5.1).
 */
@Injectable()
export class PublicPages {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
  ) {}

  resolveSchoolId(slug: string): Promise<string> {
    return this.tenant.runInTenant({ schoolId: null, userId: null }, () =>
      this.queryBus.execute(new ResolvePublicSchoolQuery(slug)),
    );
  }

  async render(slug: string): Promise<PublicSchoolPage> {
    const schoolId = await this.resolveSchoolId(slug);
    return this.tenant.runInTenant({ schoolId, userId: null }, () =>
      this.queryBus.execute(new GetPublicSchoolPageQuery()),
    );
  }
}

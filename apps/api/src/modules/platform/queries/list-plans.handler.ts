import type { PlanListResponse } from '@driveos/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { plans } from '../infra/schema.js';
import { ListPlansQuery } from './list-plans.query.js';

@QueryHandler(ListPlansQuery)
export class ListPlansHandler implements IQueryHandler<ListPlansQuery, PlanListResponse> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListPlansQuery): Promise<PlanListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        baseAmountMinor: plans.baseAmountMinor,
        studentFeeMinor: plans.studentFeeMinor,
        currency: plans.currency,
        maxInstructorSeats: plans.maxInstructorSeats,
        features: plans.features,
        active: plans.active,
      })
      .from(plans)
      .where(
        and(
          cursor ? gt(plans.id, cursor) : undefined,
          params.active ? eq(plans.active, params.active === 'true') : undefined,
        ),
      )
      .orderBy(asc(plans.id))
      .limit(params.limit + 1);
    return pageOf(rows, params.limit, (plan) => plan.id);
  }
}

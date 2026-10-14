import type { OpeningHoursResponse } from '@driveos/shared';
import { asc, eq, isNull, or } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { hhmm } from '../infra/school-records.js';
import { openingHours } from '../infra/schema.js';
import { GetOpeningHoursQuery } from './get-opening-hours.query.js';

@QueryHandler(GetOpeningHoursQuery)
export class GetOpeningHoursHandler implements IQueryHandler<
  GetOpeningHoursQuery,
  OpeningHoursResponse
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ branchId }: GetOpeningHoursQuery): Promise<OpeningHoursResponse> {
    const rows = await this.tenant.tx
      .select()
      .from(openingHours)
      .where(
        branchId
          ? or(isNull(openingHours.branchId), eq(openingHours.branchId, branchId))
          : undefined,
      )
      .orderBy(asc(openingHours.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        weekday: row.weekday,
        opens: hhmm(row.opens),
        closes: hhmm(row.closes),
      })),
    };
  }
}

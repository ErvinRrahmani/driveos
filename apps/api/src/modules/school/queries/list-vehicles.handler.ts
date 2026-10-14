import type { VehicleListResponse } from '@driveos/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toVehicle } from '../infra/school-records.js';
import { vehicles } from '../infra/schema.js';
import { ListVehiclesQuery } from './list-vehicles.query.js';

@QueryHandler(ListVehiclesQuery)
export class ListVehiclesHandler implements IQueryHandler<ListVehiclesQuery, VehicleListResponse> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ params }: ListVehiclesQuery): Promise<VehicleListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(vehicles)
      .where(
        and(
          cursor ? gt(vehicles.id, cursor) : undefined,
          params.branchId ? eq(vehicles.branchId, params.branchId) : undefined,
          params.active ? eq(vehicles.active, params.active === 'true') : undefined,
        ),
      )
      .orderBy(asc(vehicles.id))
      .limit(params.limit + 1);
    return pageOf(rows.map(toVehicle), params.limit, (vehicle) => vehicle.id);
  }
}

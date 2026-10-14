import type { Vehicle } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { toVehicle } from '../infra/school-records.js';
import { vehicles } from '../infra/schema.js';
import { GetVehicleQuery } from './get-vehicle.query.js';

@QueryHandler(GetVehicleQuery)
export class GetVehicleHandler implements IQueryHandler<GetVehicleQuery, Vehicle | null> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ vehicleId }: GetVehicleQuery): Promise<Vehicle | null> {
    const [row] = await this.tenant.tx.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    return row ? toVehicle(row) : null;
  }
}

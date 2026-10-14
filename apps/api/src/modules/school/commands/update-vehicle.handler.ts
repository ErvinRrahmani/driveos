import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { vehicleChanged } from '../events/vehicle-changed.js';
import { SchoolRecords } from '../infra/school-records.js';
import { vehicles } from '../infra/schema.js';
import { UpdateVehicleCommand } from './update-vehicle.command.js';

@CommandHandler(UpdateVehicleCommand)
export class UpdateVehicleHandler implements ICommandHandler<UpdateVehicleCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ vehicleId, patch }: UpdateVehicleCommand): Promise<CommandResult> {
    if (patch.branchId) await this.records.assertBranchesExist([patch.branchId]);
    const [row] = await this.tenant.tx
      .update(vehicles)
      .set({ ...patch, version: sql`${vehicles.version} + 1` })
      .where(eq(vehicles.id, vehicleId))
      .returning();
    if (!row) throw notFound();
    await this.publisher.append([vehicleChanged(row, 'updated')]);
    return { id: row.id, version: row.version };
  }
}

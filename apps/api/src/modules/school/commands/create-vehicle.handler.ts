import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { vehicleChanged } from '../events/vehicle-changed.js';
import { SchoolRecords } from '../infra/school-records.js';
import { vehicles } from '../infra/schema.js';
import { CreateVehicleCommand } from './create-vehicle.command.js';

@CommandHandler(CreateVehicleCommand)
export class CreateVehicleHandler implements ICommandHandler<CreateVehicleCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ body }: CreateVehicleCommand): Promise<CommandResult> {
    await this.records.assertBranchesExist([body.branchId]);
    const [row] = await this.tenant.tx
      .insert(vehicles)
      .values({ ...body, schoolId: this.records.schoolId })
      .returning();
    if (!row) throw new Error('Vehicle insert returned no row');
    await this.publisher.append([vehicleChanged(row, 'created')]);
    return { id: row.id, version: row.version };
  }
}

import type { UpdateVehicleRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class UpdateVehicleCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly vehicleId: string,
    readonly patch: UpdateVehicleRequest,
  ) {
    super();
  }
}

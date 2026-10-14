import type { Vehicle } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetVehicleQuery extends Query<Vehicle | null> {
  constructor(readonly vehicleId: string) {
    super();
  }
}

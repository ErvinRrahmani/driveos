import type { ListVehiclesQuery as ListVehiclesParams, VehicleListResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListVehiclesQuery extends Query<VehicleListResponse> {
  constructor(readonly params: ListVehiclesParams) {
    super();
  }
}

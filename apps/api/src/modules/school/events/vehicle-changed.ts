import { type RecordChange, VehicleChanged } from '@driveos/shared';
import { newEvent } from '../../../kernel/cqrs/index.js';
import { toVehicle } from '../infra/school-records.js';
import type { vehicles } from '../infra/schema.js';

export function vehicleChanged(row: typeof vehicles.$inferSelect, change: RecordChange) {
  const { id, ...vehicle } = toVehicle(row);
  return newEvent(VehicleChanged, {
    aggregateType: 'vehicle',
    aggregateId: id,
    aggregateVersion: row.version,
    payload: { vehicleId: id, change, ...vehicle },
  });
}

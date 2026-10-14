import { BranchChanged, type RecordChange } from '@driveos/shared';
import { newEvent } from '../../../kernel/cqrs/index.js';
import type { branches } from '../infra/schema.js';

export function branchChanged(row: typeof branches.$inferSelect, change: RecordChange) {
  return newEvent(BranchChanged, {
    aggregateType: 'branch',
    aggregateId: row.id,
    aggregateVersion: row.version,
    payload: {
      branchId: row.id,
      change,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
    },
  });
}

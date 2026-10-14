import type { ListStaffQuery as ListStaffParams, StaffListResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListStaffQuery extends Query<StaffListResponse> {
  constructor(readonly params: ListStaffParams) {
    super();
  }
}

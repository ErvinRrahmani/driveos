import type { OpeningHoursResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetOpeningHoursQuery extends Query<OpeningHoursResponse> {
  constructor(readonly branchId: string | null) {
    super();
  }
}

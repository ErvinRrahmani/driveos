import type { ReportRangeQuery, RevenueReportResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetRevenueReportQuery extends Query<RevenueReportResponse> {
  constructor(readonly params: ReportRangeQuery) {
    super();
  }
}

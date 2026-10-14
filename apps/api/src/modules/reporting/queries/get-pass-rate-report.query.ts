import type { PassRateReportResponse, ReportRangeQuery } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetPassRateReportQuery extends Query<PassRateReportResponse> {
  constructor(readonly params: ReportRangeQuery) {
    super();
  }
}

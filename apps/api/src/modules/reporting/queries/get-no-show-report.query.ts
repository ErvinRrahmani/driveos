import type { NoShowReportResponse, ReportRangeQuery } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetNoShowReportQuery extends Query<NoShowReportResponse> {
  constructor(readonly params: ReportRangeQuery) {
    super();
  }
}

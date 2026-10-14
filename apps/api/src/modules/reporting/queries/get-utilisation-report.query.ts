import type { ReportRangeQuery, UtilisationReportResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetUtilisationReportQuery extends Query<UtilisationReportResponse> {
  constructor(readonly params: ReportRangeQuery) {
    super();
  }
}

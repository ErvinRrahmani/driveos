import type { GrowthReport, GrowthReportQuery } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetGrowthReportQuery extends Query<GrowthReport> {
  constructor(readonly params: GrowthReportQuery) {
    super();
  }
}

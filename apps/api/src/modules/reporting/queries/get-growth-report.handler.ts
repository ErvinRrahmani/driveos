import type { GrowthReport } from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { GrowthReports } from '../infra/growth-reports.js';
import { GetGrowthReportQuery } from './get-growth-report.query.js';

@QueryHandler(GetGrowthReportQuery)
export class GetGrowthReportHandler implements IQueryHandler<GetGrowthReportQuery, GrowthReport> {
  constructor(private readonly reports: GrowthReports) {}

  async execute({ params }: GetGrowthReportQuery): Promise<GrowthReport> {
    const report = params.month
      ? await this.reports.byMonth(params.month)
      : await this.reports.latest();
    if (!report) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'growth_report_missing',
        t('errors.growth_report_missing'),
      );
    }
    return report;
  }
}

import type { RevenueReportResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { sumByPeriod, totalOf } from '../domain/reports.js';
import { ReportRows } from '../infra/report-rows.js';
import { SchoolProfiles } from '../infra/school-profile.js';
import { GetRevenueReportQuery } from './get-revenue-report.query.js';

const KEYS = [
  'revenueInAppMinor',
  'revenueRecordedMinor',
  'refundsMinor',
  'upsellsSold',
  'upsellRevenueMinor',
  'packageMinutesSold',
] as const;

@QueryHandler(GetRevenueReportQuery)
export class GetRevenueReportHandler implements IQueryHandler<
  GetRevenueReportQuery,
  RevenueReportResponse
> {
  constructor(
    private readonly rows: ReportRows,
    private readonly schools: SchoolProfiles,
  ) {}

  async execute({ params }: GetRevenueReportQuery): Promise<RevenueReportResponse> {
    const { from, to, bucket } = params;
    const { currency } = await this.schools.current();
    const daily = (await this.rows.daily(from, to)).filter((row) => row.currency === currency);
    const sums = sumByPeriod(daily, from, to, bucket, KEYS);
    return {
      from,
      to,
      bucket,
      items: sums.map((sum) => ({ ...sum, currency })),
      totals: { currency, ...totalOf(sums, KEYS) },
    };
  }
}

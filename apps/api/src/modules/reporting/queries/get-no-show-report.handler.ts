import type { NoShowReportResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { basisPoints, sumByPeriod, totalOf } from '../domain/reports.js';
import { ReportRows } from '../infra/report-rows.js';
import { GetNoShowReportQuery } from './get-no-show-report.query.js';

const KEYS = ['lessonsDue', 'noShows'] as const;

const withRate = (sums: { lessonsDue: number; noShows: number }) => ({
  lessonsDue: sums.lessonsDue,
  noShows: sums.noShows,
  noShowRateBp: basisPoints(sums.noShows, sums.lessonsDue),
});

@QueryHandler(GetNoShowReportQuery)
export class GetNoShowReportHandler implements IQueryHandler<
  GetNoShowReportQuery,
  NoShowReportResponse
> {
  constructor(private readonly rows: ReportRows) {}

  async execute({ params }: GetNoShowReportQuery): Promise<NoShowReportResponse> {
    const { from, to, bucket } = params;
    const sums = sumByPeriod(await this.rows.daily(from, to), from, to, bucket, KEYS);
    return {
      from,
      to,
      bucket,
      items: sums.map((sum) => ({ period: sum.period, ...withRate(sum) })),
      totals: withRate(totalOf(sums, KEYS)),
    };
  }
}

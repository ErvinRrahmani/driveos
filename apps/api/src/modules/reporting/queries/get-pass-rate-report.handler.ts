import { type PassRateReportResponse, type TestAttemptKind } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { basisPoints, sumByPeriod, totalOf } from '../domain/reports.js';
import { ReportRows } from '../infra/report-rows.js';
import { GetPassRateReportQuery } from './get-pass-rate-report.query.js';

const KINDS: readonly TestAttemptKind[] = ['theory', 'practical'];
const KEYS = ['attempts', 'passed'] as const;

const withRate = (kind: TestAttemptKind, sums: { attempts: number; passed: number }) => ({
  kind,
  attempts: sums.attempts,
  passed: sums.passed,
  passRateBp: basisPoints(sums.passed, sums.attempts),
});

@QueryHandler(GetPassRateReportQuery)
export class GetPassRateReportHandler implements IQueryHandler<
  GetPassRateReportQuery,
  PassRateReportResponse
> {
  constructor(private readonly rows: ReportRows) {}

  async execute({ params }: GetPassRateReportQuery): Promise<PassRateReportResponse> {
    const { from, to, bucket } = params;
    const attempts = await this.rows.testAttempts(from, to);
    const byKind = KINDS.map((kind) => ({
      kind,
      sums: sumByPeriod(
        attempts.filter((row) => row.kind === kind),
        from,
        to,
        bucket,
        KEYS,
      ),
    }));
    const periods = byKind[0]?.sums.map((sum) => sum.period) ?? [];
    return {
      from,
      to,
      bucket,
      items: periods.flatMap((period, index) =>
        byKind.map(({ kind, sums }) => ({
          period,
          ...withRate(kind, sums[index] ?? { attempts: 0, passed: 0 }),
        })),
      ),
      totals: byKind.map(({ kind, sums }) => withRate(kind, totalOf(sums, KEYS))),
    };
  }
}

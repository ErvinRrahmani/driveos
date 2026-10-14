import { sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { TestAttemptKind } from '@driveos/shared';
import { GetTestAttemptStatsQuery, type TestAttemptCount } from './get-test-attempt-stats.query.js';

interface CountRow extends Record<string, unknown> {
  period: string;
  kind: TestAttemptKind;
  attempts: number;
  passed: number;
}

@QueryHandler(GetTestAttemptStatsQuery)
export class GetTestAttemptStatsHandler implements IQueryHandler<
  GetTestAttemptStatsQuery,
  TestAttemptCount[]
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ range }: GetTestAttemptStatsQuery): Promise<TestAttemptCount[]> {
    const result = await this.tenant.tx.execute<CountRow>(sql`
      select to_char(date_trunc(${range.bucket}, taken_on), 'YYYY-MM-DD') as period,
             kind,
             count(*)::int as attempts,
             (count(*) filter (where result = 'passed'))::int as passed
        from test_attempts
       where taken_on between ${range.from}::date and ${range.to}::date
       group by 1, 2
       order by 1, kind::text`);
    return result.rows.map((row) => ({
      period: row.period,
      kind: row.kind,
      attempts: row.attempts,
      passed: row.passed,
    }));
  }
}

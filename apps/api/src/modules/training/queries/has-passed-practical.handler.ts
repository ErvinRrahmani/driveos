import { and, eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { testAttempts } from '../infra/schema.js';
import { HasPassedPracticalQuery } from './has-passed-practical.query.js';

@QueryHandler(HasPassedPracticalQuery)
export class HasPassedPracticalHandler implements IQueryHandler<HasPassedPracticalQuery, boolean> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ studentId }: HasPassedPracticalQuery): Promise<boolean> {
    const [row] = await this.tenant.tx
      .select({ id: testAttempts.id })
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.studentId, studentId),
          eq(testAttempts.kind, 'practical'),
          eq(testAttempts.result, 'passed'),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}

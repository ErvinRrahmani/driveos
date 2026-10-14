import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { IssuePlatformStatementCommand } from '../commands/issue-platform-statement.command.js';
import { previousMonth } from '../domain/platform-fees.js';

const MONTHLY_STATEMENTS_JOB = 'billing.monthly-statements';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

@Injectable()
export class MonthlyStatementsJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: MONTHLY_STATEMENTS_JOB,
      pattern: '0 2 1 * *',
      handler: () => this.issueStatements(),
    });
  }

  issueStatements(month?: string): Promise<PerSchoolSummary> {
    const issuedAt = new Date();
    const target = month ?? previousMonth(issuedAt);
    if (!MONTH.test(target)) throw new RangeError(`"${target}" is not a YYYY-MM month`);
    return this.perSchool.runForEachSchool(MONTHLY_STATEMENTS_JOB, async () => {
      await this.commandBus.execute(new IssuePlatformStatementCommand(target, issuedAt));
    });
  }
}

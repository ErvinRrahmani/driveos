import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { GenerateGrowthReportCommand } from '../commands/generate-growth-report.command.js';
import { growthMonthDue } from '../domain/growth.js';
import { GrowthReports } from './growth-reports.js';
import { SchoolProfiles } from './school-profile.js';

export const GROWTH_REPORT_JOB = 'reporting.growth-report';

@Injectable()
export class GrowthReportJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
    private readonly schools: SchoolProfiles,
    private readonly reports: GrowthReports,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: GROWTH_REPORT_JOB,
      pattern: '0 * * * *',
      handler: () => this.run(),
    });
  }

  run(now: Date = new Date()): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(GROWTH_REPORT_JOB, async () => {
      const { timeZone } = await this.schools.current();
      const month = growthMonthDue(now, timeZone);
      if (!month || (await this.reports.byMonth(month))) return;
      await this.commandBus.execute(new GenerateGrowthReportCommand(month));
    });
  }
}

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { PurgeLeadsCommand } from '../commands/purge-leads.command.js';

export const LEAD_PURGE_JOB = 'training.lead-purge';

/** Daily lead retention per school (design §8): `PurgeLeadsCommand` in each school's transaction. */
@Injectable()
export class LeadPurgeJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: LEAD_PURGE_JOB,
      pattern: '15 3 * * *',
      handler: () => this.purge(),
    });
  }

  purge(now: Date = new Date()): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(LEAD_PURGE_JOB, async () => {
      await this.commandBus.execute(new PurgeLeadsCommand(now));
    });
  }
}

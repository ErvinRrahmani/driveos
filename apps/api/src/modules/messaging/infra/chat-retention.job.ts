import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { PurgeExpiredMessagesCommand } from '../commands/purge-expired-messages.command.js';

export const CHAT_RETENTION_JOB = 'messaging.chat-retention';

@Injectable()
export class ChatRetentionJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: CHAT_RETENTION_JOB,
      pattern: '30 3 * * *',
      handler: () => this.purge(),
    });
  }

  purge(now: Date = new Date()): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(CHAT_RETENTION_JOB, async () => {
      await this.commandBus.execute(new PurgeExpiredMessagesCommand(now));
    });
  }
}

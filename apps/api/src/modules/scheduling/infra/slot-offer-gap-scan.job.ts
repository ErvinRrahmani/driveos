import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { ScanSlotGapsCommand } from '../commands/scan-slot-gaps.command.js';

export const SLOT_OFFER_GAP_SCAN_JOB = 'scheduling.slot-offer-gap-scan';

@Injectable()
export class SlotOfferGapScanJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: SLOT_OFFER_GAP_SCAN_JOB,
      pattern: '0 2 * * *',
      handler: () => this.scan(),
    });
  }

  scan(now: Date = new Date()): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(SLOT_OFFER_GAP_SCAN_JOB, async () => {
      await this.commandBus.execute(new ScanSlotGapsCommand(now));
    });
  }
}

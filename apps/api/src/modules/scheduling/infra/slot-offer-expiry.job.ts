import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { PerSchoolJobs, type PerSchoolSummary, ScheduledJobs } from '../../../kernel/jobs/index.js';
import { ExpireSlotOffersCommand } from '../commands/expire-slot-offers.command.js';

export const SLOT_OFFER_EXPIRY_JOB = 'scheduling.slot-offer-expiry';
export const SLOT_OFFER_EXPIRY_EVERY_MS = 60_000;

@Injectable()
export class SlotOfferExpiryJob implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledJobs,
    private readonly perSchool: PerSchoolJobs,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.scheduled.register({
      name: SLOT_OFFER_EXPIRY_JOB,
      every: SLOT_OFFER_EXPIRY_EVERY_MS,
      handler: () => this.expire(),
    });
  }

  expire(now: Date = new Date()): Promise<PerSchoolSummary> {
    return this.perSchool.runForEachSchool(SLOT_OFFER_EXPIRY_JOB, async () => {
      await this.commandBus.execute(new ExpireSlotOffersCommand(now));
    });
  }
}

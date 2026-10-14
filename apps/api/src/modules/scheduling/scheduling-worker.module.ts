import { Module } from '@nestjs/common';
import { BillingWorkerModule } from '../billing/billing-worker.module.js';
import { IdentityWorkerModule } from '../identity/identity-worker.module.js';
import { ExpireSlotOffersHandler } from './commands/expire-slot-offers.handler.js';
import { OfferCancelledSlotHandler } from './commands/offer-cancelled-slot.handler.js';
import { ScanSlotGapsHandler } from './commands/scan-slot-gaps.handler.js';
import { AvailabilityRecords } from './infra/availability-records.js';
import { ChangeFeedRecords } from './infra/change-feed-records.js';
import { LessonRecords } from './infra/lesson-records.js';
import { LessonViews } from './infra/lesson-views.js';
import { ReminderJobs } from './infra/reminder-jobs.js';
import { ScheduleWindowsReader } from './infra/schedule-windows.js';
import { SchoolFacts } from './infra/school-facts.js';
import { SlotOfferAudience } from './infra/slot-offer-audience.js';
import { SlotOfferCreator } from './infra/slot-offer-creator.js';
import { SlotOfferExpiryJob } from './infra/slot-offer-expiry.job.js';
import { SyncBacklogAlert } from './infra/sync-backlog.alert.js';
import { SlotOfferGapScanJob } from './infra/slot-offer-gap-scan.job.js';
import { SlotOfferRecords } from './infra/slot-offer-records.js';
import { SlotValidator } from './infra/slot-validator.js';
import { ViewerScope } from './infra/viewer-scope.js';
import { WaitingListRecords } from './infra/waiting-list-records.js';
import { ChangeFeedProjection } from './projections/change-feed.projection.js';
import { GetLessonHandler } from './queries/get-lesson.handler.js';
import { LessonRemindersSubscriber } from './subscribers/lesson-reminders.subscriber.js';
import { SlotOffersFromCancellationsSubscriber } from './subscribers/slot-offers-from-cancellations.subscriber.js';

@Module({
  imports: [IdentityWorkerModule, BillingWorkerModule],
  providers: [
    SchoolFacts,
    LessonRecords,
    LessonViews,
    GetLessonHandler,
    ReminderJobs,
    LessonRemindersSubscriber,
    AvailabilityRecords,
    ScheduleWindowsReader,
    ViewerScope,
    SlotValidator,
    WaitingListRecords,
    SlotOfferRecords,
    SlotOfferAudience,
    SlotOfferCreator,
    ExpireSlotOffersHandler,
    SlotOfferExpiryJob,
    SyncBacklogAlert,
    OfferCancelledSlotHandler,
    SlotOffersFromCancellationsSubscriber,
    ScanSlotGapsHandler,
    SlotOfferGapScanJob,
    ChangeFeedRecords,
    ChangeFeedProjection,
  ],
})
export class SchedulingWorkerModule {}

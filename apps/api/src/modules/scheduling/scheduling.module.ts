import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { AcceptSlotOfferHandler } from './commands/accept-slot-offer.handler.js';
import { ApplySyncOperationsHandler } from './commands/apply-sync-operations.handler.js';
import { AddTimeOffHandler } from './commands/add-time-off.handler.js';
import { BookLessonHandler } from './commands/book-lesson.handler.js';
import { CancelLessonHandler } from './commands/cancel-lesson.handler.js';
import { CompleteLessonHandler } from './commands/complete-lesson.handler.js';
import { CreateLessonTypeHandler } from './commands/create-lesson-type.handler.js';
import { CreateSlotOfferHandler } from './commands/create-slot-offer.handler.js';
import { JoinWaitingListHandler } from './commands/join-waiting-list.handler.js';
import { LeaveWaitingListHandler } from './commands/leave-waiting-list.handler.js';
import { MarkNoShowHandler } from './commands/mark-no-show.handler.js';
import { MoveLessonHandler } from './commands/move-lesson.handler.js';
import { ReplaceAvailabilityHandler } from './commands/replace-availability.handler.js';
import { UpdateLessonTypeHandler } from './commands/update-lesson-type.handler.js';
import { AvailabilityController } from './http/availability.controller.js';
import { CalendarController } from './http/calendar.controller.js';
import { LessonTypesController } from './http/lesson-types.controller.js';
import { LessonsController } from './http/lessons.controller.js';
import { SlotOffersController } from './http/slot-offers.controller.js';
import { SyncController } from './http/sync.controller.js';
import { WaitingListController } from './http/waiting-list.controller.js';
import { SchedulingAccess } from './infra/access.js';
import { AvailabilityRecords } from './infra/availability-records.js';
import { ChangeFeedRecords } from './infra/change-feed-records.js';
import { LessonActors } from './infra/lesson-actors.js';
import { LessonConflicts } from './infra/lesson-conflicts.js';
import { LessonOutcomes } from './infra/lesson-outcomes.js';
import { LessonRecords } from './infra/lesson-records.js';
import { LessonViews } from './infra/lesson-views.js';
import { ScheduleWindowsReader } from './infra/schedule-windows.js';
import { SchoolFacts } from './infra/school-facts.js';
import { SlotOfferAudience } from './infra/slot-offer-audience.js';
import { SlotOfferCreator } from './infra/slot-offer-creator.js';
import { SlotOfferRecords } from './infra/slot-offer-records.js';
import { SlotValidator } from './infra/slot-validator.js';
import { SyncChanges } from './infra/sync-changes.js';
import { SyncOperationRecords } from './infra/sync-operation-records.js';
import { ViewerScope } from './infra/viewer-scope.js';
import { WaitingListRecords } from './infra/waiting-list-records.js';
import { CountCompletedLessonsHandler } from './queries/count-completed-lessons.handler.js';
import { GetAvailabilityHandler } from './queries/get-availability.handler.js';
import { GetCalendarHandler } from './queries/get-calendar.handler.js';
import { GetLessonTypeHandler } from './queries/get-lesson-type.handler.js';
import { GetLessonHandler } from './queries/get-lesson.handler.js';
import { HasCompletedLessonsHandler } from './queries/has-completed-lessons.handler.js';
import { ListFreeSlotsHandler } from './queries/list-free-slots.handler.js';
import { ListLessonTypesHandler } from './queries/list-lesson-types.handler.js';
import { ListSlotOffersHandler } from './queries/list-slot-offers.handler.js';
import { ListStudentIdsWithLessonsHandler } from './queries/list-student-ids-with-lessons.handler.js';
import { ListSyncChangesHandler } from './queries/list-sync-changes.handler.js';
import { ListWaitingListHandler } from './queries/list-waiting-list.handler.js';

@Module({
  imports: [IdentityModule, BillingModule, PlatformModule],
  controllers: [
    LessonTypesController,
    CalendarController,
    AvailabilityController,
    LessonsController,
    SyncController,
    WaitingListController,
    SlotOffersController,
  ],
  providers: [
    SchedulingAccess,
    AvailabilityRecords,
    SchoolFacts,
    LessonRecords,
    LessonViews,
    ScheduleWindowsReader,
    ViewerScope,
    SlotValidator,
    LessonConflicts,
    LessonActors,
    LessonOutcomes,
    WaitingListRecords,
    SlotOfferRecords,
    SlotOfferAudience,
    SlotOfferCreator,
    BookLessonHandler,
    CancelLessonHandler,
    MoveLessonHandler,
    CompleteLessonHandler,
    MarkNoShowHandler,
    CreateLessonTypeHandler,
    UpdateLessonTypeHandler,
    ListLessonTypesHandler,
    GetLessonTypeHandler,
    ReplaceAvailabilityHandler,
    AddTimeOffHandler,
    GetAvailabilityHandler,
    GetCalendarHandler,
    ListFreeSlotsHandler,
    GetLessonHandler,
    ListStudentIdsWithLessonsHandler,
    CountCompletedLessonsHandler,
    HasCompletedLessonsHandler,
    JoinWaitingListHandler,
    LeaveWaitingListHandler,
    ListWaitingListHandler,
    CreateSlotOfferHandler,
    AcceptSlotOfferHandler,
    ListSlotOffersHandler,
    ChangeFeedRecords,
    SyncChanges,
    ListSyncChangesHandler,
    SyncOperationRecords,
    ApplySyncOperationsHandler,
  ],
})
export class SchedulingModule {}

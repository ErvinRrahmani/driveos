import { Module } from '@nestjs/common';
import { GenericEuInvoicePolicy } from '../../adapters/invoices/generic-eu-invoice-policy.js';
import { INVOICE_POLICY } from '../../adapters/invoices/invoice-policy.js';
import { notificationSenderProviders } from '../../adapters/notification-senders.provider.js';
import { IdentityWorkerModule } from '../identity/identity-worker.module.js';
import { PurgeExpiredMessagesHandler } from './commands/purge-expired-messages.handler.js';
import { SendNotificationHandler } from './commands/send-notification.handler.js';
import { ChatRetentionJob } from './infra/chat-retention.job.js';
import { NotificationClock } from './infra/notification-clock.js';
import { NotificationDispatchJob } from './infra/notification-dispatch.job.js';
import { NotificationDispatcher } from './infra/notification-dispatcher.js';
import { SchoolTimingReader } from './infra/school-timing.js';
import { StudentAudience } from './infra/student-audience.js';
import { PlanNotificationMomentHandler } from './queries/plan-notification-moment.handler.js';
import { BillingNotificationsSubscriber } from './subscribers/billing-notifications.subscriber.js';
import { ChatNotificationsSubscriber } from './subscribers/chat-notifications.subscriber.js';
import { ContractNotificationsSubscriber } from './subscribers/contract-notifications.subscriber.js';
import { ConversationsSubscriber } from './subscribers/conversations.subscriber.js';
import { GuardianConsentNotificationsSubscriber } from './subscribers/guardian-consent-notifications.subscriber.js';
import { GrowthReportNotificationsSubscriber } from './subscribers/growth-report-notifications.subscriber.js';
import { InvitationNotificationsSubscriber } from './subscribers/invitation-notifications.subscriber.js';
import { LeadNotificationsSubscriber } from './subscribers/lead-notifications.subscriber.js';
import { LessonNotificationsSubscriber } from './subscribers/lesson-notifications.subscriber.js';
import { ReviewRequestSubscriber } from './subscribers/review-request.subscriber.js';
import { SlotOfferNotificationsSubscriber } from './subscribers/slot-offer-notifications.subscriber.js';

@Module({
  imports: [IdentityWorkerModule],
  providers: [
    ...notificationSenderProviders,
    { provide: INVOICE_POLICY, useClass: GenericEuInvoicePolicy },
    ConversationsSubscriber,
    PurgeExpiredMessagesHandler,
    ChatRetentionJob,
    NotificationClock,
    SchoolTimingReader,
    StudentAudience,
    SendNotificationHandler,
    PlanNotificationMomentHandler,
    NotificationDispatcher,
    NotificationDispatchJob,
    InvitationNotificationsSubscriber,
    GuardianConsentNotificationsSubscriber,
    LessonNotificationsSubscriber,
    BillingNotificationsSubscriber,
    ContractNotificationsSubscriber,
    ChatNotificationsSubscriber,
    SlotOfferNotificationsSubscriber,
    GrowthReportNotificationsSubscriber,
    LeadNotificationsSubscriber,
    ReviewRequestSubscriber,
  ],
})
export class MessagingWorkerModule {}

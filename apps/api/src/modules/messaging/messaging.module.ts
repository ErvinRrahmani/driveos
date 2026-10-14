import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MarkConversationReadHandler } from './commands/mark-conversation-read.handler.js';
import { SendMessageHandler } from './commands/send-message.handler.js';
import { ConversationsController } from './http/conversations.controller.js';
import { ChatAccessService } from './infra/chat-access.js';
import { ChatViews } from './infra/chat-views.js';
import { ReadPointers } from './infra/read-pointers.js';
import { SchoolTimingReader } from './infra/school-timing.js';
import { ListConversationsHandler } from './queries/list-conversations.handler.js';
import { ListMessagesHandler } from './queries/list-messages.handler.js';
import { PlanNotificationMomentHandler } from './queries/plan-notification-moment.handler.js';

@Module({
  imports: [IdentityModule],
  controllers: [ConversationsController],
  providers: [
    ChatAccessService,
    ChatViews,
    ReadPointers,
    SendMessageHandler,
    MarkConversationReadHandler,
    ListConversationsHandler,
    ListMessagesHandler,
    SchoolTimingReader,
    PlanNotificationMomentHandler,
  ],
})
export class MessagingModule {}

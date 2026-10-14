import { z } from 'zod';
import { dateTimeSchema } from '../dto/common.js';
import { conversationKindSchema } from '../dto/enums.js';
import { defineEvent } from './define-event.js';

export const MESSAGE_PREVIEW_MAX = 140;

export const MessageSent = defineEvent({
  type: 'MessageSent',
  version: 1,
  schema: z.object({
    messageId: z.uuid(),
    conversationId: z.uuid(),
    conversationKind: conversationKindSchema,
    senderUserId: z.uuid(),
    recipientUserIds: z.array(z.uuid()),
    preview: z.string().max(MESSAGE_PREVIEW_MAX),
    sentAt: dateTimeSchema,
  }),
});

export const DeviceTokenInvalidated = defineEvent({
  type: 'DeviceTokenInvalidated',
  version: 1,
  schema: z.object({
    deviceId: z.uuid(),
    userId: z.uuid(),
    notificationId: z.uuid(),
  }),
});

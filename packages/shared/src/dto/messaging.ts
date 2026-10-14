import { z } from 'zod';
import { dateTimeSchema, pageQuerySchema, pageResponseSchema } from './common.js';
import { conversationKindSchema } from './enums.js';

export const MESSAGE_BODY_MAX = 4000;

export const lastMessageSchema = z.object({
  id: z.uuid(),
  senderUserId: z.uuid(),
  senderName: z.string(),
  preview: z.string(),
  sentAt: dateTimeSchema,
});
export type LastMessage = z.infer<typeof lastMessageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  kind: conversationKindSchema,
  studentId: z.uuid(),
  studentName: z.string(),
  instructorMembershipId: z.uuid().nullable(),
  instructorName: z.string().nullable(),
  readOnly: z.boolean(),
  schoolCanRead: z.boolean(),
  unreadCount: z.number().int().nonnegative(),
  lastReadMessageId: z.uuid().nullable(),
  lastMessage: lastMessageSchema.nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const listConversationsQuerySchema = pageQuerySchema.extend({
  kind: conversationKindSchema.optional(),
  studentId: z.uuid().optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const conversationListResponseSchema = pageResponseSchema(conversationSchema);
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderUserId: z.uuid(),
  senderName: z.string(),
  body: z.string(),
  sentAt: dateTimeSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const listMessagesQuerySchema = pageQuerySchema;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const messageListResponseSchema = pageResponseSchema(messageSchema);
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const sendMessageRequestSchema = z.strictObject({
  body: z.string().trim().min(1).max(MESSAGE_BODY_MAX),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const markConversationReadRequestSchema = z.strictObject({
  lastReadMessageId: z.uuid(),
});
export type MarkConversationReadRequest = z.infer<typeof markConversationReadRequestSchema>;

export const markConversationReadResponseSchema = z.object({
  conversationId: z.uuid(),
  lastReadMessageId: z.uuid(),
  unreadCount: z.number().int().nonnegative(),
});
export type MarkConversationReadResponse = z.infer<typeof markConversationReadResponseSchema>;

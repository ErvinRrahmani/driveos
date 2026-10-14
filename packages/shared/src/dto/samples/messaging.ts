import type {
  Conversation,
  ConversationListResponse,
  LastMessage,
  ListConversationsQuery,
  ListMessagesQuery,
  MarkConversationReadRequest,
  MarkConversationReadResponse,
  Message,
  MessageListResponse,
  SendMessageRequest,
} from '../messaging.js';
import { SAMPLE_IDS as ids } from './fixtures.js';

const message = {
  id: ids.message,
  conversationId: ids.conversation,
  senderUserId: ids.instructorUser,
  senderName: 'Ingo Instructor',
  body: 'I will pick you up at the station at 08:00.',
  sentAt: '2026-10-06T07:15:00.000Z',
} satisfies Message;

const lastMessage = {
  id: message.id,
  senderUserId: message.senderUserId,
  senderName: message.senderName,
  preview: message.body,
  sentAt: message.sentAt,
} satisfies LastMessage;

const conversation = {
  id: ids.conversation,
  kind: 'student_instructor',
  studentId: ids.student,
  studentName: 'Stella Student',
  instructorMembershipId: ids.instructorMembership,
  instructorName: 'Ingo Instructor',
  readOnly: false,
  schoolCanRead: true,
  unreadCount: 1,
  lastReadMessageId: null,
  lastMessage,
} satisfies Conversation;

export const messagingSamples = {
  lastMessage,
  conversation,
  listConversationsQuery: {
    kind: 'student_instructor',
    limit: 50,
  } satisfies ListConversationsQuery,
  conversationListResponse: {
    items: [
      conversation,
      {
        ...conversation,
        id: '0192f000-011a-7000-8000-000000000002',
        kind: 'student_school',
        instructorMembershipId: null,
        instructorName: null,
        schoolCanRead: false,
        unreadCount: 0,
        lastReadMessageId: null,
        lastMessage: null,
      },
    ],
    nextCursor: null,
  } satisfies ConversationListResponse,
  message,
  listMessagesQuery: { cursor: 'MDE5MmYwMDAtMDExYg', limit: 50 } satisfies ListMessagesQuery,
  messageListResponse: {
    items: [
      message,
      {
        id: '0192f000-011b-7000-8000-000000000002',
        conversationId: ids.conversation,
        senderUserId: ids.studentUser,
        senderName: 'Stella Student',
        body: 'Where do we meet tomorrow?',
        sentAt: '2026-10-05T19:40:00.000Z',
      },
    ],
    nextCursor: null,
  } satisfies MessageListResponse,
  sendMessageRequest: { body: 'Thanks, see you there!' } satisfies SendMessageRequest,
  markConversationReadRequest: {
    lastReadMessageId: ids.message,
  } satisfies MarkConversationReadRequest,
  markConversationReadResponse: {
    conversationId: ids.conversation,
    lastReadMessageId: ids.message,
    unreadCount: 0,
  } satisfies MarkConversationReadResponse,
};

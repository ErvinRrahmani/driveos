import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { memberships, users } from '../../identity/infra/schema.js';
import { schoolId } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

export const conversationsKind = pgEnum('conversations_kind', [
  'student_school',
  'student_instructor',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    schoolId: schoolId(),
    kind: conversationsKind('kind').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    instructorMembershipId: uuid('instructor_membership_id').references(() => memberships.id),
    lastMessageAt: tstz('last_message_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('conversations_student_school_key')
      .on(t.schoolId, t.studentId)
      .where(sql`${t.kind} = 'student_school'`),
    uniqueIndex('conversations_student_instructor_key')
      .on(t.schoolId, t.studentId, t.instructorMembershipId)
      .where(sql`${t.kind} = 'student_instructor'`),
    index('conversations_instructor_idx').on(t.schoolId, t.instructorMembershipId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    schoolId: schoolId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    sentAt: tstz('sent_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('messages_conversation_sent_idx').on(t.conversationId, t.sentAt, t.id),
    index('messages_school_sent_idx').on(t.schoolId, t.sentAt),
  ],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: id(),
    schoolId: schoolId(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    lastReadMessageId: uuid('last_read_message_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('conversation_members_conversation_membership_key').on(
      t.conversationId,
      t.membershipId,
    ),
  ],
);

export const notificationsChannel = pgEnum('notifications_channel', ['push', 'sms', 'email']);
export const notificationsStatus = pgEnum('notifications_status', [
  'scheduled',
  'sent',
  'failed',
  'skipped',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid('user_id').references(() => users.id),
    address: text('address'),
    locale: text('locale'),
    channel: notificationsChannel('channel').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload').notNull(),
    status: notificationsStatus('status').notNull(),
    scheduledFor: tstz('scheduled_for').notNull(),
    skipAfter: tstz('skip_after'),
    dedupeKey: text('dedupe_key'),
    sentAt: tstz('sent_at'),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (t) => [
    check(
      'notifications_recipient_check',
      sql`${t.userId} is not null or ${t.address} is not null`,
    ),
    uniqueIndex('notifications_dedupe_key')
      .on(t.schoolId, t.userId, t.channel, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('notifications_due_idx')
      .on(t.schoolId, t.scheduledFor)
      .where(sql`${t.status} = 'scheduled'`),
  ],
);

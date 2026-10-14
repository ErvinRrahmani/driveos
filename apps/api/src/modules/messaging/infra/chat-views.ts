import type { Conversation, Message } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../identity/index.js';
import { ListStudentNamesQuery } from '../../training/index.js';
import { type ChatAccess, messagePreview, schoolCanRead } from '../domain/chat.js';
import type { ChatActor, ConversationRow } from './chat-access.js';
import { conversationMembers, messages } from './schema.js';

export type MessageRow = typeof messages.$inferSelect;

const pointerMessages = alias(messages, 'pointer');

@Injectable()
export class ChatViews {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async conversations(
    actor: ChatActor,
    rows: readonly ConversationRow[],
    access: ReadonlyMap<string, ChatAccess>,
  ): Promise<Conversation[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [studentNames, instructorNames, lastMessages, pointers, unread] = await Promise.all([
      this.studentNames(rows.map((row) => row.studentId)),
      this.instructorNames(rows),
      this.lastMessages(ids),
      this.pointers(actor.membershipId, ids),
      this.unreadCounts(actor, ids),
    ]);
    const senders = await this.userNames([...lastMessages.values()].map((m) => m.senderUserId));
    return rows.map((row) => {
      const last = lastMessages.get(row.id);
      return {
        id: row.id,
        kind: row.kind,
        studentId: row.studentId,
        studentName: studentNames.get(row.studentId) ?? '',
        instructorMembershipId: row.instructorMembershipId,
        instructorName: row.instructorMembershipId
          ? (instructorNames.get(row.instructorMembershipId) ?? '')
          : null,
        readOnly: access.get(row.id)?.readOnly ?? true,
        schoolCanRead: schoolCanRead(row.kind),
        unreadCount: unread.get(row.id) ?? 0,
        lastReadMessageId: pointers.get(row.id) ?? null,
        lastMessage: last
          ? {
              id: last.id,
              senderUserId: last.senderUserId,
              senderName: senders.get(last.senderUserId) ?? '',
              preview: messagePreview(last.body),
              sentAt: last.sentAt.toISOString(),
            }
          : null,
      };
    });
  }

  async messages(rows: readonly MessageRow[]): Promise<Message[]> {
    const names = await this.userNames(rows.map((row) => row.senderUserId));
    return rows.map((row) => this.message(row, names.get(row.senderUserId) ?? ''));
  }

  message(row: MessageRow, senderName: string): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderUserId: row.senderUserId,
      senderName,
      body: row.body,
      sentAt: row.sentAt.toISOString(),
    };
  }

  async userNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const contacts = await this.directory.contactsOf(unique);
    return new Map(contacts.map((contact) => [contact.userId, contact.fullName]));
  }

  async unreadCounts(actor: ChatActor, conversationIds: readonly string[]) {
    if (conversationIds.length === 0) return new Map<string, number>();
    const rows = await this.tenant.tx
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .leftJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, messages.conversationId),
          eq(conversationMembers.membershipId, actor.membershipId),
        ),
      )
      .leftJoin(pointerMessages, eq(pointerMessages.id, conversationMembers.lastReadMessageId))
      .where(
        and(
          inArray(messages.conversationId, [...conversationIds]),
          ne(messages.senderUserId, actor.userId),
          or(
            isNull(pointerMessages.id),
            sql`(${messages.sentAt}, ${messages.id}) > (${pointerMessages.sentAt}, ${pointerMessages.id})`,
          ),
        ),
      )
      .groupBy(messages.conversationId);
    return new Map(rows.map((row) => [row.conversationId, row.count]));
  }

  private async studentNames(studentIds: readonly string[]): Promise<Map<string, string>> {
    const names = await this.queryBus.execute(new ListStudentNamesQuery([...new Set(studentIds)]));
    return new Map(names.map((name) => [name.studentId, name.fullName]));
  }

  private async instructorNames(rows: readonly ConversationRow[]): Promise<Map<string, string>> {
    if (!rows.some((row) => row.instructorMembershipId)) return new Map();
    const staff = await this.directory.listStaff();
    return new Map(staff.map((member) => [member.membershipId, member.fullName]));
  }

  private async lastMessages(conversationIds: readonly string[]) {
    const rows = await this.tenant.tx
      .selectDistinctOn([messages.conversationId])
      .from(messages)
      .where(inArray(messages.conversationId, [...conversationIds]))
      .orderBy(messages.conversationId, desc(messages.sentAt), desc(messages.id));
    return new Map(rows.map((row) => [row.conversationId, row]));
  }

  private async pointers(membershipId: string, conversationIds: readonly string[]) {
    const rows = await this.tenant.tx
      .select({
        conversationId: conversationMembers.conversationId,
        lastReadMessageId: conversationMembers.lastReadMessageId,
      })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.membershipId, membershipId),
          inArray(conversationMembers.conversationId, [...conversationIds]),
        ),
      );
    return new Map(rows.map((row) => [row.conversationId, row.lastReadMessageId]));
  }
}

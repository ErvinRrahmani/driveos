import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { MessagePosition } from '../domain/chat.js';
import { conversationMembers, messages } from './schema.js';

@Injectable()
export class ReadPointers {
  constructor(private readonly tenant: TenantContext) {}

  async lock(conversationId: string, membershipId: string): Promise<MessagePosition | null> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Read pointers need a school scope');
    await this.tenant.tx
      .insert(conversationMembers)
      .values({ id: newId(), schoolId, conversationId, membershipId })
      .onConflictDoNothing();
    const [row] = await this.tenant.tx
      .select({ id: messages.id, sentAt: messages.sentAt })
      .from(conversationMembers)
      .leftJoin(messages, eq(messages.id, conversationMembers.lastReadMessageId))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.membershipId, membershipId),
        ),
      )
      .for('update', { of: conversationMembers });
    return row?.id && row.sentAt ? { id: row.id, sentAt: row.sentAt } : null;
  }

  async set(conversationId: string, membershipId: string, messageId: string): Promise<void> {
    await this.tenant.tx
      .update(conversationMembers)
      .set({ lastReadMessageId: messageId })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.membershipId, membershipId),
        ),
      );
  }
}

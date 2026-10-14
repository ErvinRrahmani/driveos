import type { MarkConversationReadResponse } from '@driveos/shared';
import { and, eq } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { invalidField } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { laterPointer } from '../domain/chat.js';
import { ChatAccessService } from '../infra/chat-access.js';
import { ChatViews } from '../infra/chat-views.js';
import { ReadPointers } from '../infra/read-pointers.js';
import { messages } from '../infra/schema.js';
import { MarkConversationReadCommand } from './mark-conversation-read.command.js';

@CommandHandler(MarkConversationReadCommand)
export class MarkConversationReadHandler implements ICommandHandler<
  MarkConversationReadCommand,
  MarkConversationReadResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: ChatAccessService,
    private readonly pointers: ReadPointers,
    private readonly views: ChatViews,
  ) {}

  async execute({
    actor,
    conversationId,
    body,
  }: MarkConversationReadCommand): Promise<MarkConversationReadResponse> {
    const chat = await this.access.actor(actor);
    const { row } = await this.access.require(chat, conversationId);
    const [target] = await this.tenant.tx
      .select({ id: messages.id, sentAt: messages.sentAt })
      .from(messages)
      .where(and(eq(messages.id, body.lastReadMessageId), eq(messages.conversationId, row.id)));
    if (!target) {
      throw invalidField(['lastReadMessageId'], 'The message is not in this conversation');
    }
    const current = await this.pointers.lock(row.id, chat.membershipId);
    const next = laterPointer(current, target);
    if (next.id !== current?.id) await this.pointers.set(row.id, chat.membershipId, next.id);
    const unread = await this.views.unreadCounts(chat, [row.id]);
    return {
      conversationId: row.id,
      lastReadMessageId: next.id,
      unreadCount: unread.get(row.id) ?? 0,
    };
  }
}

import type { MessageListResponse } from '@driveos/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ChatAccessService } from '../infra/chat-access.js';
import { ChatViews } from '../infra/chat-views.js';
import { messages } from '../infra/schema.js';
import { ListMessagesQuery } from './list-messages.query.js';

@QueryHandler(ListMessagesQuery)
export class ListMessagesHandler implements IQueryHandler<ListMessagesQuery, MessageListResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: ChatAccessService,
    private readonly views: ChatViews,
  ) {}

  async execute({
    actor,
    conversationId,
    params,
  }: ListMessagesQuery): Promise<MessageListResponse> {
    const chat = await this.access.actor(actor);
    const { row } = await this.access.require(chat, conversationId);
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      eq(messages.conversationId, row.id),
      cursor
        ? sql`(${messages.sentAt}, ${messages.id}) < (select m.sent_at, m.id from ${messages} m where m.id = ${cursor} and m.conversation_id = ${row.id})`
        : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(messages)
      .where(and(...filters))
      .orderBy(desc(messages.sentAt), desc(messages.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (message) => message.id);
    return { items: await this.views.messages(page.items), nextCursor: page.nextCursor };
  }
}

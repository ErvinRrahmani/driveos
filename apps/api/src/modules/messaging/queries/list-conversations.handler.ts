import type { ConversationListResponse } from '@driveos/shared';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ChatAccessService } from '../infra/chat-access.js';
import { ChatViews } from '../infra/chat-views.js';
import { conversations } from '../infra/schema.js';
import { ListConversationsQuery } from './list-conversations.query.js';

const activity = sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`;

@QueryHandler(ListConversationsQuery)
export class ListConversationsHandler implements IQueryHandler<
  ListConversationsQuery,
  ConversationListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: ChatAccessService,
    private readonly views: ChatViews,
  ) {}

  async execute({ actor, params }: ListConversationsQuery): Promise<ConversationListResponse> {
    const chat = await this.access.actor(actor);
    const visible = this.access.visibleWhere(chat.viewer);
    if (visible === null) return { items: [], nextCursor: null };
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      visible,
      params.kind ? eq(conversations.kind, params.kind) : undefined,
      params.studentId ? eq(conversations.studentId, params.studentId) : undefined,
      cursor
        ? sql`(${activity}, ${conversations.id}) < (select coalesce(c.last_message_at, c.created_at), c.id from ${conversations} c where c.id = ${cursor})`
        : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(activity), desc(conversations.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    const access = await this.access.decide(chat.viewer, page.items);
    return {
      items: await this.views.conversations(chat, page.items, access),
      nextCursor: page.nextCursor,
    };
  }
}

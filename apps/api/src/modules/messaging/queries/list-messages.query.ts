import type { ListMessagesQuery as ListMessagesParams, MessageListResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListMessagesQuery extends Query<MessageListResponse> {
  constructor(
    readonly actor: Principal,
    readonly conversationId: string,
    readonly params: ListMessagesParams,
  ) {
    super();
  }
}

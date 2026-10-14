import type {
  ConversationListResponse,
  ListConversationsQuery as ListConversationsParams,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListConversationsQuery extends Query<ConversationListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListConversationsParams,
  ) {
    super();
  }
}

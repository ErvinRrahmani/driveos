import type { MarkConversationReadRequest, MarkConversationReadResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class MarkConversationReadCommand extends Command<MarkConversationReadResponse> {
  constructor(
    readonly actor: Principal,
    readonly conversationId: string,
    readonly body: MarkConversationReadRequest,
  ) {
    super();
  }
}

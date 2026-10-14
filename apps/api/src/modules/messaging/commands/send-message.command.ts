import type { Message, SendMessageRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class SendMessageCommand extends Command<Message> {
  constructor(
    readonly actor: Principal,
    readonly conversationId: string,
    readonly body: SendMessageRequest,
  ) {
    super();
  }
}

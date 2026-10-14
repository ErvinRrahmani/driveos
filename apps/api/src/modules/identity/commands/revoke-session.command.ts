import { Command } from '../../../kernel/cqrs/index.js';

export class RevokeSessionCommand extends Command<void> {
  constructor(readonly refreshToken: string) {
    super();
  }
}

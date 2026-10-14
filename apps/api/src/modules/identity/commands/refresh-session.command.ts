import type { SessionResponse } from '@driveos/shared';
import { Command } from '../../../kernel/cqrs/index.js';

export class RefreshSessionCommand extends Command<SessionResponse> {
  constructor(readonly refreshToken: string) {
    super();
  }
}

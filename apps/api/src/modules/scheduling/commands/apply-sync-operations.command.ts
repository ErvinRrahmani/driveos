import type { SyncPushRequest, SyncPushResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class ApplySyncOperationsCommand extends Command<SyncPushResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: SyncPushRequest,
  ) {
    super();
  }
}

import type { LinkGuardianRequest, LinkGuardianResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class LinkGuardianCommand extends Command<LinkGuardianResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
    readonly body: LinkGuardianRequest,
  ) {
    super();
  }
}

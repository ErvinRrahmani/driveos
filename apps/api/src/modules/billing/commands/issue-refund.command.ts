import type { IssueRefundRequest, IssueRefundResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export class IssueRefundCommand extends Command<IssueRefundResponse> {
  constructor(
    readonly actor: Principal,
    readonly body: IssueRefundRequest,
  ) {
    super();
  }
}

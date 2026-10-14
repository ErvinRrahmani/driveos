import type { SubmitReviewRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

/** The calling student reviews their school; the student comes from the caller's user id. */
export class SubmitReviewCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly body: SubmitReviewRequest,
  ) {
    super();
  }
}

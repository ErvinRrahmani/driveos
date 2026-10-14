import type { ModerateReviewRequest } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

/** Approves (shows on the public page) or hides a review. */
export class ModerateReviewCommand extends Command<CommandResult> {
  constructor(
    readonly actor: Principal,
    readonly reviewId: string,
    readonly body: ModerateReviewRequest,
  ) {
    super();
  }
}

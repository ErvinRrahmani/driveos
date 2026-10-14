import { Command } from '../../../kernel/cqrs/index.js';

export class ReleaseEntitlementCommand extends Command<void> {
  constructor(readonly lessonId: string) {
    super();
  }
}

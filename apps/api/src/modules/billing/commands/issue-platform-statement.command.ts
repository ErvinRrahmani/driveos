import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class IssuePlatformStatementCommand extends Command<CommandResult | null> {
  constructor(
    readonly month: string,
    readonly issuedAt: Date,
  ) {
    super();
  }
}

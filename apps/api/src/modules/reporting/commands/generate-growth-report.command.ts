import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export class GenerateGrowthReportCommand extends Command<CommandResult> {
  constructor(readonly month: string) {
    super();
  }
}

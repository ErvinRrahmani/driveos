import { Command, type CommandResult } from '../../../../src/kernel/cqrs/index.js';

export class RecordPingCommand extends Command<CommandResult> {
  constructor(readonly message: string) {
    super();
  }
}

import { Command } from '../../../kernel/cqrs/index.js';

export class RequestLoginCodeCommand extends Command<void> {
  constructor(
    readonly contact: string,
    readonly ip: string,
  ) {
    super();
  }
}

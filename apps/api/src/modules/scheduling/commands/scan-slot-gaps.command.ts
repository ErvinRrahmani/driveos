import { Command } from '../../../kernel/cqrs/index.js';

export class ScanSlotGapsCommand extends Command<{ created: number }> {
  constructor(readonly now: Date) {
    super();
  }
}

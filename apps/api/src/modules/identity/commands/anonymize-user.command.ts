import { Command } from '../../../kernel/cqrs/index.js';

export interface AnonymizedUser {
  userAnonymized: boolean;
}

export class AnonymizeUserCommand extends Command<AnonymizedUser> {
  constructor(readonly userId: string) {
    super();
  }
}

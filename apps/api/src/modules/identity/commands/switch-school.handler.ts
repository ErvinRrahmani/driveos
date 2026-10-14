import type { SessionResponse } from '@driveos/shared';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { SessionIssuer } from '../infra/session-issuer.js';
import { SwitchSchoolCommand } from './switch-school.command.js';

@CommandHandler(SwitchSchoolCommand)
export class SwitchSchoolHandler implements ICommandHandler<SwitchSchoolCommand, SessionResponse> {
  constructor(private readonly issuer: SessionIssuer) {}

  async execute(command: SwitchSchoolCommand): Promise<SessionResponse> {
    const resolved = await this.issuer.resolve(command.userId, {
      membershipId: command.membershipId,
    });
    if (!resolved.active) throw notFound();
    return this.issuer.issue(resolved, command.client, new Date());
  }
}

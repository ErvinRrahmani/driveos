import type { LinkGuardianResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { invalidField, notFound } from '../../../kernel/http/errors.js';
import { CreateInvitationCommand, MembershipDirectory } from '../../identity/index.js';
import { GuardianLinks } from '../infra/guardian-links.js';
import { StudentRecords } from '../infra/student-records.js';
import { studentNotActive } from '../infra/training-errors.js';
import { LinkGuardianCommand } from './link-guardian.command.js';

@CommandHandler(LinkGuardianCommand)
export class LinkGuardianHandler implements ICommandHandler<
  LinkGuardianCommand,
  LinkGuardianResponse
> {
  constructor(
    private readonly records: StudentRecords,
    private readonly links: GuardianLinks,
    private readonly commandBus: CommandBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async execute({ actor, studentId, body }: LinkGuardianCommand): Promise<LinkGuardianResponse> {
    const student = await this.records.lock(studentId);
    if (student.status === 'anonymized') throw studentNotActive();
    if (!body.guardianUserId) {
      const invitation = await this.commandBus.execute(
        new CreateInvitationCommand(
          actor.userId,
          ['parent'],
          { phone: body.phone, email: body.email },
          studentId,
          [],
        ),
      );
      return { id: invitation.id, version: invitation.version, pending: true };
    }
    const membership = await this.directory.findByUser(body.guardianUserId);
    if (!membership) throw notFound();
    if (!membership.roles.includes('parent') || membership.status === 'disabled') {
      throw invalidField(['guardianUserId'], 'Not a parent of this school');
    }
    const link = await this.links.link(studentId, body.guardianUserId);
    return { id: link.id, version: link.version, pending: false };
  }
}

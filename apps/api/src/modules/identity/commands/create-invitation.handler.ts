import { CommandHandler, type ICommandHandler, QueryBus } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { GetMissingBranchIdsQuery } from '../../school/index.js';
import { GetStudentMinorStatusQuery } from '../../training/index.js';
import { InvitationIssuer } from '../infra/invitation-issuer.js';
import { CreateInvitationCommand, type CreatedInvitation } from './create-invitation.command.js';

@CommandHandler(CreateInvitationCommand)
export class CreateInvitationHandler implements ICommandHandler<
  CreateInvitationCommand,
  CreatedInvitation
> {
  constructor(
    private readonly issuer: InvitationIssuer,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: CreateInvitationCommand): Promise<CreatedInvitation> {
    this.issuer.contacts(command.contact);
    if (
      command.studentId &&
      !(await this.queryBus.execute(new GetStudentMinorStatusQuery(command.studentId)))
    ) {
      throw notFound();
    }
    const missing = await this.queryBus.execute(new GetMissingBranchIdsQuery(command.branchIds));
    if (missing.length > 0) throw notFound();
    return this.issuer.issue({
      invitedBy: command.invitedBy,
      roles: command.roles,
      contact: command.contact,
      studentId: command.studentId,
      branchIds: command.branchIds,
    });
  }
}

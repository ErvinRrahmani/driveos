import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { permissionsForRoles } from '../domain/permissions.js';
import { InvitationIssuer } from '../infra/invitation-issuer.js';
import type { CreatedInvitation } from './create-invitation.command.js';
import { InviteOwnerCommand } from './invite-owner.command.js';
import { StatusCodes } from 'http-status-codes';

@CommandHandler(InviteOwnerCommand)
export class InviteOwnerHandler implements ICommandHandler<InviteOwnerCommand, CreatedInvitation> {
  constructor(private readonly issuer: InvitationIssuer) {}

  execute({ actor, contact }: InviteOwnerCommand): Promise<CreatedInvitation> {
    if (actor.tokenType !== 'access' || !permissionsForRoles(actor.roles).has('platform.manage')) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'), {
        permission: 'platform.manage',
      });
    }
    return this.issuer.issue({
      invitedBy: actor.userId,
      roles: ['owner'],
      contact,
      studentId: null,
      branchIds: [],
    });
  }
}

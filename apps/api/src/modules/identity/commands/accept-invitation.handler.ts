import {
  type AcceptInvitationResponse,
  MembershipCreated,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
  type MembershipStatus,
} from '@driveos/shared';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  type NewDomainEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentMinorStatusQuery } from '../../training/index.js';
import { invitationState } from '../domain/invitation.js';
import { mergeRoles, normalizeRoles } from '../domain/membership.js';
import { hashSecret } from '../domain/secrets.js';
import { AuthDirectory, type InvitationLookup } from '../infra/auth-directory.js';
import { IdentitySettings } from '../infra/identity-settings.js';
import { type InvitationRow, InvitationsRepository } from '../infra/invitations.repository.js';
import { MembershipsRepository } from '../infra/memberships.repository.js';
import { users } from '../infra/schema.js';
import { AcceptInvitationCommand } from './accept-invitation.command.js';
import { identityError, invalidField } from './identity-errors.js';
import { membershipEvent } from './membership-event.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function assertOpen(invitation: Pick<InvitationLookup, 'expiresAt' | 'acceptedAt'>, now: Date) {
  const state = invitationState(invitation, now);
  if (state === 'used') throw identityError('invitation_used');
  if (state === 'expired') throw identityError('invitation_expired');
}

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<
  AcceptInvitationCommand,
  AcceptInvitationResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly directory: AuthDirectory,
    private readonly invitations: InvitationsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly queryBus: QueryBus,
    private readonly settings: IdentitySettings,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<AcceptInvitationResponse> {
    if (!TOKEN.test(command.token)) throw notFound();
    const now = new Date();
    const tokenHash = hashSecret(this.settings.pepper, command.token);
    const found = await this.tenant.runInTenant({ schoolId: null, userId: null }, async () => {
      const invitation = await this.directory.invitationByTokenHash(tokenHash);
      if (!invitation) return null;
      return { invitation, userId: await this.contactUser(invitation) };
    });
    if (!found) throw notFound();
    const { invitation } = found;
    assertOpen(invitation, now);
    if (!found.userId && command.fullName === undefined) {
      throw invalidField(['fullName'], 'A full name is required to create the account');
    }
    const userId = found.userId ?? newId();
    return this.tenant.runInTenant({ schoolId: invitation.schoolId, userId }, async () => {
      const locked = await this.invitations.lockById(invitation.invitationId);
      if (!locked) throw notFound();
      assertOpen(locked, now);
      if (!found.userId) {
        await this.tenant.tx.insert(users).values({
          id: userId,
          fullName: command.fullName ?? '',
          phone: locked.phone,
          email: locked.email,
          locale: command.locale ?? 'en',
        });
      }
      const result = await this.join(locked, userId);
      await this.invitations.markAccepted(locked.id, now);
      return result;
    });
  }

  private async contactUser(invitation: InvitationLookup): Promise<string | null> {
    const byPhone = invitation.phone
      ? await this.directory.findUserByContact(invitation.phone)
      : null;
    const byEmail = invitation.email
      ? await this.directory.findUserByContact(invitation.email)
      : null;
    if (byPhone && byEmail && byPhone !== byEmail) throw identityError('contact_conflict');
    return byPhone ?? byEmail;
  }

  private async initialStatus(invitation: InvitationRow): Promise<MembershipStatus> {
    if (!invitation.roles.includes('student') || !invitation.studentId) return 'active';
    const minor = await this.queryBus.execute(new GetStudentMinorStatusQuery(invitation.studentId));
    if (!minor) throw notFound();
    return minor.isMinor && !minor.hasGuardianConsent ? 'pending_consent' : 'active';
  }

  private async join(invitation: InvitationRow, userId: string): Promise<AcceptInvitationResponse> {
    const { schoolId, studentId } = invitation;
    const existing = await this.memberships.lockByUser(userId);
    if (!existing) {
      const membershipId = newId();
      const roles = normalizeRoles(invitation.roles);
      const status = await this.initialStatus(invitation);
      await this.memberships.insert({ id: membershipId, schoolId, userId, roles, status });
      await this.memberships.addBranches(schoolId, membershipId, invitation.branchIds);
      await this.publisher.append([
        membershipEvent(MembershipCreated, membershipId, 1, {
          schoolId,
          membershipId,
          userId,
          roles,
          status,
          studentId,
        }),
      ]);
      return { membershipId, userId, status, studentId };
    }
    if (existing.status === 'disabled') throw identityError('membership_disabled');
    const roles = mergeRoles(existing.roles, invitation.roles);
    const rolesChanged = roles.length !== existing.roles.length;
    const addedBranches = await this.memberships.addBranches(
      schoolId,
      existing.id,
      invitation.branchIds,
    );
    const events: NewDomainEvent[] = [];
    let version = existing.version;
    const fields = { schoolId, membershipId: existing.id, userId, roles };
    if (rolesChanged) {
      version += 1;
      events.push(
        membershipEvent(MembershipRolesChanged, existing.id, version, {
          ...fields,
          previousRoles: existing.roles,
          studentId,
        }),
      );
    }
    if (rolesChanged || addedBranches > 0) {
      version += 1;
      events.push(
        membershipEvent(MembershipPermissionsChanged, existing.id, version, {
          ...fields,
          grants: await this.memberships.grants(existing.id),
          branchIds: await this.memberships.branchIds(existing.id),
        }),
      );
    }
    if (events.length > 0) {
      await this.memberships.update(existing.id, { roles, status: existing.status, version });
      await this.publisher.append(events);
    }
    return { membershipId: existing.id, userId, status: existing.status, studentId };
  }
}

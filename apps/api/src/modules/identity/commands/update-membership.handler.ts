import {
  MembershipDisabled,
  MembershipPermissionsChanged,
  MembershipRolesChanged,
} from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  type NewDomainEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { GetMissingBranchIdsQuery } from '../../school/index.js';
import { planMembershipUpdate } from '../domain/membership.js';
import { MembershipsRepository } from '../infra/memberships.repository.js';
import { RefreshTokensRepository } from '../infra/refresh-tokens.repository.js';
import { identityError } from './identity-errors.js';
import { membershipEvent } from './membership-event.js';
import { UpdateMembershipCommand } from './update-membership.command.js';
import { StatusCodes } from 'http-status-codes';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

@CommandHandler(UpdateMembershipCommand)
export class UpdateMembershipHandler implements ICommandHandler<
  UpdateMembershipCommand,
  CommandResult
> {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly queryBus: QueryBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: UpdateMembershipCommand): Promise<CommandResult> {
    const { patch } = command;
    const current = await this.memberships.lockById(command.membershipId);
    if (!current) throw notFound();
    const { id, schoolId, userId } = current;
    if (
      patch.branchIds &&
      (await this.queryBus.execute(new GetMissingBranchIdsQuery(patch.branchIds))).length > 0
    ) {
      throw notFound();
    }
    const grants = await this.memberships.grants(id);
    const branchIds = await this.memberships.branchIds(id);
    let otherActiveOwners = 1;
    if (current.roles.includes('owner') || patch.roles?.includes('owner')) {
      await this.memberships.lockOwners(schoolId);
      otherActiveOwners = await this.memberships.countOtherActiveOwners(id);
    }
    const plan = planMembershipUpdate(
      { roles: current.roles, status: current.status, grants, branchIds },
      patch,
      { callerIsOwner: command.callerRoles.includes('owner'), otherActiveOwners },
    );
    if (!plan.ok) {
      if (plan.error === 'unknown_permission') {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
          permissions: plan.permissions,
        });
      }
      throw identityError(plan.error);
    }

    const { next } = plan;
    const fields = { schoolId, membershipId: id, userId, roles: next.roles };
    const events: NewDomainEvent[] = [];
    let version = current.version;
    if (plan.rolesChanged) {
      version += 1;
      events.push(
        membershipEvent(MembershipRolesChanged, id, version, {
          ...fields,
          previousRoles: current.roles,
        }),
      );
    }
    if (plan.permissionsChanged) {
      version += 1;
      events.push(
        membershipEvent(MembershipPermissionsChanged, id, version, {
          ...fields,
          grants: next.grants,
          branchIds: next.branchIds,
        }),
      );
    }
    if (plan.disabled) {
      version += 1;
      events.push(membershipEvent(MembershipDisabled, id, version, fields));
    }
    if (plan.enabled) version += 1;
    if (version === current.version) return { id, version };

    if (!sameSet(next.grants, grants)) {
      await this.memberships.replaceGrants(schoolId, id, next.grants);
    }
    if (!sameSet(next.branchIds, branchIds)) {
      await this.memberships.replaceBranches(schoolId, id, next.branchIds);
    }
    await this.memberships.update(id, { roles: next.roles, status: next.status, version });
    if (plan.disabled) await this.refreshTokens.revokeFamiliesOfMembership(id, new Date());
    await this.publisher.append(events);
    return { id, version };
  }
}

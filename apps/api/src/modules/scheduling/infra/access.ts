import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import {
  MembershipDirectory,
  type Permission,
  ROLE_PERMISSIONS,
  SUPPORT_READ_PERMISSIONS,
} from '../../identity/index.js';
import { StatusCodes } from 'http-status-codes';

const ROLE_MAP = ROLE_PERMISSIONS as Readonly<Record<string, ReadonlySet<string>>>;

export function forbidden(): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
}

@Injectable()
export class SchedulingAccess {
  constructor(
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async holdsAny(actor: Principal, permissions: readonly Permission[]): Promise<boolean> {
    if (actor.tokenType === 'support') {
      return permissions.some((permission) => SUPPORT_READ_PERMISSIONS.has(permission));
    }
    const byRole = permissions.some((permission) =>
      actor.roles.some((role) => ROLE_MAP[role]?.has(permission)),
    );
    if (byRole || !actor.membershipId) return byRole;
    const membership = await this.directory.getMembership(actor.membershipId);
    return permissions.some((permission) => membership?.grants.includes(permission) ?? false);
  }

  async requireInstructor(
    actor: Principal,
    instructorMembershipId: string,
    anyInstructor: readonly Permission[],
  ): Promise<void> {
    const isSelf = actor.membershipId === instructorMembershipId;
    if (!isSelf && !(await this.holdsAny(actor, anyInstructor))) throw forbidden();
    if (!(await this.directory.hasRole(instructorMembershipId, 'instructor'))) throw notFound();
  }
}

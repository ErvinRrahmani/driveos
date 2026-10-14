import { MembershipDisabled } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AuthDirectory } from '../infra/auth-directory.js';
import { MembershipsRepository } from '../infra/memberships.repository.js';
import { RefreshTokensRepository } from '../infra/refresh-tokens.repository.js';
import { users } from '../infra/schema.js';
import { type AnonymizedUser, AnonymizeUserCommand } from './anonymize-user.command.js';
import { membershipEvent } from './membership-event.js';

export const ANONYMIZED_USER_NAME = 'Anonymized user';

@CommandHandler(AnonymizeUserCommand)
export class AnonymizeUserHandler implements ICommandHandler<AnonymizeUserCommand, AnonymizedUser> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly memberships: MembershipsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly directory: AuthDirectory,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ userId }: AnonymizeUserCommand): Promise<AnonymizedUser> {
    const membership = await this.memberships.lockByUser(userId);
    if (!membership) return { userAnonymized: false };
    if (membership.roles.some((role) => role !== 'student')) return { userAnonymized: false };
    const now = new Date();
    if (membership.status !== 'disabled') {
      const version = membership.version + 1;
      await this.memberships.update(membership.id, {
        roles: membership.roles,
        status: 'disabled',
        version,
      });
      await this.refreshTokens.revokeFamiliesOfMembership(membership.id, now);
      await this.publisher.append([
        membershipEvent(MembershipDisabled, membership.id, version, {
          schoolId: membership.schoolId,
          membershipId: membership.id,
          userId,
          roles: membership.roles,
        }),
      ]);
    }
    const elsewhere = (await this.directory.membershipsForUser(userId)).filter(
      (other) => other.membershipId !== membership.id,
    );
    if (elsewhere.length > 0) return { userAnonymized: false };
    await this.tenant.tx
      .update(users)
      .set({ fullName: ANONYMIZED_USER_NAME, phone: null, email: null })
      .where(eq(users.id, userId));
    await this.refreshTokens.revokeAllOfUser(userId, now);
    return { userAnonymized: true };
  }
}

import type { MembershipRole, MeResponse } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { type IQueryHandler, QueryBus, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentByUserQuery } from '../../training/index.js';
import { effectivePermissions } from '../domain/permissions.js';
import { findActiveMembership } from '../domain/session.js';
import { AuthDirectory } from '../infra/auth-directory.js';
import { PermissionGrantsCache } from '../infra/permission-grants.cache.js';
import { users } from '../infra/schema.js';
import { toMembershipSummary } from '../infra/session-issuer.js';
import { GetMeQuery } from './get-me.query.js';

@QueryHandler(GetMeQuery)
export class GetMeHandler implements IQueryHandler<GetMeQuery, MeResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly directory: AuthDirectory,
    private readonly grantsCache: PermissionGrantsCache,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetMeQuery): Promise<MeResponse> {
    const [user] = await this.tenant.tx
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, query.userId));
    if (!user) throw notFound();
    const memberships = await this.directory.membershipsForUser(query.userId);
    const active =
      findActiveMembership(memberships, query.membershipId) ??
      (query.membershipId === null && query.schoolId !== null
        ? (memberships.find((m) => m.schoolId === query.schoolId && m.status === 'active') ?? null)
        : null);
    return {
      user,
      memberships: memberships.map(toMembershipSummary),
      active: active && {
        membershipId: active.membershipId,
        schoolId: active.schoolId,
        roles: active.roles as MembershipRole[],
        ...(await this.scopeOf(query.userId, active)),
      },
    };
  }

  private async scopeOf(
    userId: string,
    active: { membershipId: string; schoolId: string; roles: readonly string[] },
  ): Promise<{ grants: string[]; studentId: string | null }> {
    if (this.tenant.schoolId !== active.schoolId) {
      return { grants: [...effectivePermissions(active.roles, [])].sort(), studentId: null };
    }
    const grants = await this.grantsCache.grants(active.schoolId, userId, active.membershipId);
    const student = active.roles.includes('student')
      ? await this.queryBus.execute(new GetStudentByUserQuery(userId))
      : null;
    return {
      grants: [...effectivePermissions(active.roles, grants)].sort(),
      studentId: student?.studentId ?? null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { MembershipRole, MembershipSummary, SessionResponse } from '@driveos/shared';
import { AccessTokenService } from '../../../kernel/auth/access-token.js';
import { newId } from '../../../kernel/db/columns.js';
import { type RefreshClient, refreshTokenExpiry } from '../domain/refresh-token.js';
import { generateRefreshToken, hashSecret } from '../domain/secrets.js';
import {
  autoSelectMembership,
  findActiveMembership,
  type MembershipView,
  sessionRoles,
} from '../domain/session.js';
import { AuthDirectory } from './auth-directory.js';
import { IdentitySettings } from './identity-settings.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export type MembershipSelector = { auto: true } | { membershipId: string | null };

export interface ResolvedSession {
  userId: string;
  memberships: MembershipView[];
  active: MembershipView | null;
  roles: string[];
}

export interface IssuedRefreshToken {
  id: string;
  token: string;
}

export function toMembershipSummary(view: MembershipView): MembershipSummary {
  return {
    membershipId: view.membershipId,
    schoolId: view.schoolId,
    schoolName: view.schoolName,
    roles: view.roles as MembershipRole[],
    status: view.status,
  };
}

@Injectable()
export class SessionIssuer {
  constructor(
    private readonly directory: AuthDirectory,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly settings: IdentitySettings,
  ) {}

  async resolve(userId: string, selector: MembershipSelector): Promise<ResolvedSession> {
    const memberships = await this.directory.membershipsForUser(userId);
    const active =
      'auto' in selector
        ? autoSelectMembership(memberships)
        : findActiveMembership(memberships, selector.membershipId);
    const isPlatformAdmin = active ? false : await this.directory.isPlatformAdmin(userId);
    return { userId, memberships, active, roles: sessionRoles(active, isPlatformAdmin) };
  }

  async createRefreshToken(
    resolved: ResolvedSession,
    client: RefreshClient,
    now: Date,
    familyId: string = newId(),
  ): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const id = await this.refreshTokens.insert({
      userId: resolved.userId,
      familyId,
      tokenHash: hashSecret(this.settings.pepper, token),
      membershipId: resolved.active?.membershipId ?? null,
      client,
      expiresAt: refreshTokenExpiry(client, now, this.settings.refreshTtl),
    });
    return { id, token };
  }

  async session(resolved: ResolvedSession, refreshToken: string): Promise<SessionResponse> {
    const access = await this.accessTokens.sign({
      userId: resolved.userId,
      membershipId: resolved.active?.membershipId ?? null,
      schoolId: resolved.active?.schoolId ?? null,
      roles: resolved.roles,
    });
    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresIn,
      memberships: resolved.memberships.map(toMembershipSummary),
      activeMembershipId: resolved.active?.membershipId ?? null,
    };
  }

  async issue(
    resolved: ResolvedSession,
    client: RefreshClient,
    now: Date,
  ): Promise<SessionResponse> {
    const refresh = await this.createRefreshToken(resolved, client, now);
    return this.session(resolved, refresh.token);
  }
}

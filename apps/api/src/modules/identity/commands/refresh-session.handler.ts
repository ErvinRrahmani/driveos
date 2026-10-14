import { Logger } from '@nestjs/common';
import type { SessionResponse } from '@driveos/shared';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AuthErrorCode } from '../domain/errors.js';
import { decideRefresh, REFRESH_GRACE_MS } from '../domain/refresh-token.js';
import { hashSecret } from '../domain/secrets.js';
import { authError } from './auth-errors.js';
import { IdentitySettings } from '../infra/identity-settings.js';
import { RefreshGraceCache } from '../infra/refresh-grace-cache.js';
import {
  type RefreshTokenRow,
  RefreshTokensRepository,
} from '../infra/refresh-tokens.repository.js';
import { SessionIssuer } from '../infra/session-issuer.js';
import { RefreshSessionCommand } from './refresh-session.command.js';

type RefreshOutcome = { error: AuthErrorCode } | { session: SessionResponse };

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<
  RefreshSessionCommand,
  SessionResponse
> {
  private readonly logger = new Logger(RefreshSessionHandler.name);

  constructor(
    private readonly tenant: TenantContext,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly grace: RefreshGraceCache,
    private readonly issuer: SessionIssuer,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<SessionResponse> {
    const tokenHash = hashSecret(this.settings.pepper, command.refreshToken);
    const presented = await this.tenant.runInTenant({ schoolId: null, userId: null }, () =>
      this.refreshTokens.findByHash(tokenHash),
    );
    if (!presented) throw authError('invalid_refresh_token');
    const outcome = await this.tenant.runInTenant(
      { schoolId: null, userId: presented.userId },
      async (): Promise<RefreshOutcome> => {
        await this.refreshTokens.lockFamily(presented.familyId);
        const row = await this.refreshTokens.findById(presented.id);
        if (!row) return { error: 'invalid_refresh_token' };
        const now = new Date();
        switch (decideRefresh(row, now)) {
          case 'rotate':
            return { session: await this.rotate(row, tokenHash, now) };
          case 'grace':
            return this.successor(row, tokenHash);
          case 'reused':
            await this.refreshTokens.revokeFamily(row.familyId, now);
            this.logger.warn({ msg: 'refresh token reused, family revoked', userId: row.userId });
            return { error: 'refresh_reused' };
          case 'invalid':
            return { error: 'invalid_refresh_token' };
        }
      },
    );
    if ('error' in outcome) throw authError(outcome.error);
    return outcome.session;
  }

  private async rotate(row: RefreshTokenRow, tokenHash: string, now: Date) {
    const resolved = await this.issuer.resolve(row.userId, { membershipId: row.membershipId });
    const successor = await this.issuer.createRefreshToken(resolved, row.client, now, row.familyId);
    await this.refreshTokens.markRotated(row.id, successor.id, now);
    await this.grace.put(tokenHash, successor.token, REFRESH_GRACE_MS);
    return this.issuer.session(resolved, successor.token);
  }

  private async successor(row: RefreshTokenRow, tokenHash: string): Promise<RefreshOutcome> {
    const token = await this.grace.get(tokenHash);
    const successor = row.successorId ? await this.refreshTokens.findById(row.successorId) : null;
    if (
      !token ||
      !successor ||
      successor.revokedAt ||
      successor.tokenHash !== hashSecret(this.settings.pepper, token)
    ) {
      return { error: 'invalid_refresh_token' };
    }
    const resolved = await this.issuer.resolve(row.userId, {
      membershipId: successor.membershipId,
    });
    return { session: await this.issuer.session(resolved, token) };
  }
}

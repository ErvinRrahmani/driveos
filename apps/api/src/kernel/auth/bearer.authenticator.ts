import { ApiError } from '../http/api-error.js';
import { t } from '../i18n/i18n.js';
import type { AccessTokenService } from './access-token.js';
import type { Authenticator } from './authenticator.js';
import type { AuthRequest, Principal } from './principal.js';
import { StatusCodes } from 'http-status-codes';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

export class BearerAuthenticator implements Authenticator {
  constructor(private readonly tokens: AccessTokenService) {}

  async authenticate(request: Pick<AuthRequest, 'headers'>): Promise<Principal | null> {
    const header = request.headers.authorization;
    if (header === undefined) return null;
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    if (!match?.[1])
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'unauthenticated', t('errors.unauthenticated'));
    const result = await this.tokens.verify(match[1]);
    if (result.ok) return result.principal;
    if (result.reason === 'expired') {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'token_expired', t('errors.token_expired'));
    }
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'unauthenticated', t('errors.unauthenticated'));
  }
}

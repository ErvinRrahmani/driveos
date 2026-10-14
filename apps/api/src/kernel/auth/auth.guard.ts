import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../http/api-error.js';
import { t } from '../i18n/i18n.js';
import { AUTHENTICATORS, type Authenticator } from './authenticator.js';
import type { AuthRequest } from './principal.js';
import { IS_PUBLIC } from './public.decorator.js';
import { StatusCodes } from 'http-status-codes';

export function isPublicRoute(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHENTICATORS) private readonly authenticators: Authenticator[],
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    for (const authenticator of this.authenticators) {
      const principal = await authenticator.authenticate(request);
      if (principal) {
        request.principal = principal;
        return true;
      }
    }
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'unauthenticated', t('errors.unauthenticated'));
  }
}

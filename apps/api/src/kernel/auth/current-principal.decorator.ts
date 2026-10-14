import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest, Principal } from './principal.js';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context.switchToHttp().getRequest<AuthRequest>();
    if (!principal) throw new Error('CurrentPrincipal used on a route without a principal');
    return principal;
  },
);

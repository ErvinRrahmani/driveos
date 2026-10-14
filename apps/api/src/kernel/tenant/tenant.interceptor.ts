import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { isPublicRoute } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/principal.js';
import { TenantContext } from './tenant-context.js';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || isPublicRoute(this.reflector, context)) {
      return next.handle();
    }
    const { principal } = context.switchToHttp().getRequest<AuthRequest>();
    if (!principal) throw new Error('TenantInterceptor reached without a principal');
    return from(
      this.tenant.runInTenant({ schoolId: principal.schoolId, userId: principal.userId }, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    );
  }
}

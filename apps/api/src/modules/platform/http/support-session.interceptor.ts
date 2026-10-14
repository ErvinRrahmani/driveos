import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { from, type Observable, switchMap } from 'rxjs';
import type { AuthRequest } from '../../../kernel/auth/principal.js';
import { PlatformAuditWriter } from '../infra/audit-writer.js';

@Injectable()
export class SupportSessionInterceptor implements NestInterceptor {
  constructor(private readonly audit: PlatformAuditWriter) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const { principal } = context.switchToHttp().getRequest<AuthRequest>();
    if (principal?.tokenType !== 'support' || !principal.sessionId) return next.handle();
    return from(this.audit.useSupportSession(principal.sessionId)).pipe(
      switchMap(() => next.handle()),
    );
  }
}

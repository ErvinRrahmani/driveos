import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPublicRoute } from '../../../kernel/auth/auth.guard.js';
import type { AuthRequest, Principal } from '../../../kernel/auth/principal.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { supportSessionState } from '../domain/support-session.js';
import { PlatformAuditWriter } from '../infra/audit-writer.js';
import { SupportSessionsRepository } from '../infra/support-sessions.repository.js';
import { StatusCodes } from 'http-status-codes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RoutedRequest extends AuthRequest {
  method: string;
  path: string;
  route?: { path?: string };
  params?: Record<string, string>;
}

@Injectable()
export class SupportSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
    private readonly sessions: SupportSessionsRepository,
    private readonly audit: PlatformAuditWriter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || isPublicRoute(this.reflector, context)) return true;
    const request = context.switchToHttp().getRequest<RoutedRequest>();
    const { principal } = request;
    if (principal?.tokenType !== 'support') return true;
    await this.tenant.runInTenant({ schoolId: principal.schoolId, userId: principal.userId }, () =>
      this.auditRequest(principal, request),
    );
    return true;
  }

  private async auditRequest(principal: Principal, request: RoutedRequest): Promise<void> {
    const session = principal.sessionId ? await this.sessions.find(principal.sessionId) : null;
    if (!session || supportSessionState(session, principal, new Date()) !== 'active') {
      throw new ApiError(
        StatusCodes.UNAUTHORIZED,
        'support_session_ended',
        t('errors.support_session_ended'),
      );
    }
    const target = Object.values(request.params ?? {}).find((value) => UUID.test(value));
    await this.audit.recordInSession(session.id, {
      action: `${request.method.toUpperCase()} ${request.route?.path ?? request.path}`,
      targetType: 'route',
      targetId: target ?? session.schoolId,
    });
  }
}
